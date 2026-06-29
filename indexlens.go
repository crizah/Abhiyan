package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ── Types ────────────────────────────────────────────────────────────────────

type Column struct {
	Name string
	Type string
}

type Table struct {
	Name    string
	Columns []Column
	Indexes []Index
	FKCols  []string
	PKCols  []string
}

type Index struct {
	Name    string
	Table   string
	Columns []string
	Unique  bool
}

type Query struct {
	Name        string
	File        string
	SQL         string
	WhereCols   []ColAccess
	JoinCols    []ColAccess
	OrderByCols []string
	GroupByCols []string
	FromTables  map[string]string // alias (or table name) -> canonical table name
}

type ColAccess struct {
	Table  string
	Column string
	Kind   string // eq, range, like
}

type Finding struct {
	Table     string   `json:"table"`
	Level     string   `json:"level"` // MISSING, WARNING, REDUNDANT
	Message   string   `json:"message"`
	Queries   []string `json:"queries,omitempty"`
	SQL       string   `json:"suggested_sql,omitempty"`
}

type Report struct {
	Findings []Finding `json:"findings"`
	Summary  Summary   `json:"summary"`
}

type Summary struct {
	TablesAnalyzed  int `json:"tables_analyzed"`
	QueriesAnalyzed int `json:"queries_analyzed"`
	MissingIndexes  int `json:"missing_indexes"`
	Warnings        int `json:"warnings"`
	Redundant       int `json:"redundant"`
}

// ── Regex patterns ───────────────────────────────────────────────────────────

var (
	reCreateTable      = regexp.MustCompile(`(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(`)
	reCreateIndex      = regexp.MustCompile(`(?i)CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)`)
	reUniqueIndex      = regexp.MustCompile(`(?i)CREATE\s+UNIQUE\s+INDEX`)
	rePrimaryKey       = regexp.MustCompile(`(?i)PRIMARY\s+KEY\s*\(([^)]+)\)`)
	rePKInline         = regexp.MustCompile(`(?i)(\w+)\s+\w[^,]*PRIMARY\s+KEY`)
	reForeignKey       = regexp.MustCompile(`(?i)(?:(\w+)\s+\w[^,]*REFERENCES\s+\w+|FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES)`)
	reColumnDef        = regexp.MustCompile(`(?i)^(\w+)\s+([\w\(\)]+)`)
	reUniqueCol        = regexp.MustCompile(`(?i)(\w+)\s+\w[^,]*\bUNIQUE\b`)
	reUniqueConstraint = regexp.MustCompile(`(?i)UNIQUE\s*\(([^)]+)\)`)

	reQueryName    = regexp.MustCompile(`--\s*name:\s*(\w+)`)
	reWhere        = regexp.MustCompile(`(?i)WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|HAVING|$)`)
	reWhereCol     = regexp.MustCompile(`(?i)(?:AND\s+|OR\s+)?(?:(\w+)\.)?(\w+)\s*(=|>|<|>=|<=|!=|ILIKE|LIKE|IN\s*\(|IS\s+NULL|IS\s+NOT\s+NULL)`)
	reJoinOn       = regexp.MustCompile(`(?i)JOIN\s+(\w+)(?:\s+\w+)?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)`)
	reOrderBy      = regexp.MustCompile(`(?i)ORDER\s+BY\s+(.+?)(?:LIMIT|OFFSET|$)`)
	reOrderCol     = regexp.MustCompile(`(?i)(?:(\w+)\.)?(\w+)(?:\s+(?:ASC|DESC))?`)
	reGroupBy      = regexp.MustCompile(`(?i)GROUP\s+BY\s+(.+?)(?:ORDER|LIMIT|HAVING|$)`)
	reFromTable    = regexp.MustCompile(`(?i)\bFROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?`)
	reJoinTable    = regexp.MustCompile(`(?i)\bJOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\b`)
)

// ── Schema parsing ───────────────────────────────────────────────────────────

func parseSchemas(dir string) (map[string]*Table, error) {
	tables := map[string]*Table{}

	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return nil, err
	}

	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return nil, err
		}
		content := string(data)

		// Parse CREATE INDEX statements (can reference tables defined elsewhere)
		for _, m := range reCreateIndex.FindAllStringSubmatch(content, -1) {
			indexName := m[1]
			tableName := strings.ToLower(m[2])
			cols := splitCols(m[3])
			unique := reUniqueIndex.MatchString(m[0])

			if _, ok := tables[tableName]; !ok {
				tables[tableName] = &Table{Name: tableName}
			}
			tables[tableName].Indexes = append(tables[tableName].Indexes, Index{
				Name:    indexName,
				Table:   tableName,
				Columns: cols,
				Unique:  unique,
			})
		}

		// Parse CREATE TABLE blocks
		tableMatches := reCreateTable.FindAllStringSubmatchIndex(content, -1)
		for i, tm := range tableMatches {
			tableName := strings.ToLower(content[tm[2]:tm[3]])
			t := &Table{Name: tableName}
			if existing, ok := tables[tableName]; ok {
				t.Indexes = existing.Indexes
			}

			// Extract block between parens
			start := tm[1] // after opening paren
			end := len(content)
			if i+1 < len(tableMatches) {
				end = tableMatches[i+1][0]
			}
			block := content[start:end]

			// Find closing paren of CREATE TABLE
			depth := 1
			blockEnd := 0
			for j, ch := range block {
				if ch == '(' {
					depth++
				} else if ch == ')' {
					depth--
					if depth == 0 {
						blockEnd = j
						break
					}
				}
			}
			if blockEnd > 0 {
				block = block[:blockEnd]
			}

			lines := strings.Split(block, "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "--") {
					continue
				}

				// Inline PRIMARY KEY
				if m := rePKInline.FindStringSubmatch(line); m != nil {
					t.PKCols = append(t.PKCols, strings.ToLower(m[1]))
				}
				// Table-level PRIMARY KEY
				if m := rePrimaryKey.FindStringSubmatch(line); m != nil {
					for _, c := range splitCols(m[1]) {
						t.PKCols = append(t.PKCols, c)
					}
				}
				// Inline UNIQUE on a column definition
				if m := reUniqueCol.FindStringSubmatch(line); m != nil {
					col := strings.ToLower(m[1])
					idxName := fmt.Sprintf("unique_%s_%s", tableName, col)
					t.Indexes = append(t.Indexes, Index{
						Name:    idxName,
						Table:   tableName,
						Columns: []string{col},
						Unique:  true,
					})
				}
				// Table-level UNIQUE constraint: UNIQUE(col1, col2) — creates an implicit index
				if strings.Contains(strings.ToUpper(line), "UNIQUE") && reUniqueConstraint.MatchString(line) {
					if m := reUniqueConstraint.FindStringSubmatch(line); m != nil {
						cols := splitCols(m[1])
						idxName := fmt.Sprintf("unique_%s_%s", tableName, strings.Join(cols, "_"))
						t.Indexes = append(t.Indexes, Index{
							Name:    idxName,
							Table:   tableName,
							Columns: cols,
							Unique:  true,
						})
					}
				}
				// Foreign keys
				if m := reForeignKey.FindStringSubmatch(line); m != nil {
					if m[1] != "" {
						t.FKCols = append(t.FKCols, strings.ToLower(m[1]))
					} else if m[2] != "" {
						for _, c := range splitCols(m[2]) {
							t.FKCols = append(t.FKCols, c)
						}
					}
				}
				// Column definitions
				if m := reColumnDef.FindStringSubmatch(line); m != nil {
					name := strings.ToLower(m[1])
					if !isKeyword(name) {
						t.Columns = append(t.Columns, Column{Name: name, Type: m[2]})
					}
				}
			}

			tables[tableName] = t
		}
	}

	return tables, nil
}

// ── Query parsing ────────────────────────────────────────────────────────────

func parseQueries(dir string) ([]Query, error) {
	var queries []Query

	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return nil, err
	}

	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return nil, err
		}
		content := string(data)
		qs := splitQueries(content, filepath.Base(f))
		queries = append(queries, qs...)
	}

	return queries, nil
}

func splitQueries(content, filename string) []Query {
	var queries []Query
	parts := reQueryName.Split(content, -1)
	names := reQueryName.FindAllStringSubmatch(content, -1)

	for i, name := range names {
		if i+1 >= len(parts) {
			break
		}
		sql := strings.TrimSpace(parts[i+1])
		// strip sqlc type suffix (:one, :many, :exec)
		if idx := strings.Index(sql, "\n"); idx > 0 {
			firstLine := sql[:idx]
			if strings.Contains(firstLine, ":") {
				sql = strings.TrimSpace(sql[idx:])
			}
		}

		q := Query{
			Name:       name[1],
			File:       filename,
			SQL:        sql,
			FromTables: map[string]string{},
		}

		// Normalize for regex: collapse newlines
		flat := strings.ReplaceAll(sql, "\n", " ")
		flat = strings.ReplaceAll(flat, "\t", " ")

		// Build alias -> canonical table map from FROM and JOIN clauses
		for _, m := range reFromTable.FindAllStringSubmatch(flat, -1) {
			table := strings.ToLower(m[1])
			alias := strings.ToLower(m[2])
			if alias == "" || isKeyword(alias) {
				alias = table
			}
			q.FromTables[alias] = table
			q.FromTables[table] = table
		}
		for _, m := range reJoinTable.FindAllStringSubmatch(flat, -1) {
			table := strings.ToLower(m[1])
			alias := strings.ToLower(m[2])
			if alias == "" || isKeyword(alias) {
				alias = table
			}
			q.FromTables[alias] = table
			q.FromTables[table] = table
		}

		// WHERE columns
		if wm := reWhere.FindStringSubmatch(flat); wm != nil {
			clause := wm[1]
			for _, cm := range reWhereCol.FindAllStringSubmatch(clause, -1) {
				col := strings.ToLower(cm[2])
				op := strings.ToUpper(strings.TrimSpace(cm[3]))
				kind := "eq"
				if strings.ContainsAny(op, "<>") || op == "!=" {
					kind = "range"
				} else if strings.Contains(op, "LIKE") {
					kind = "like"
				}
				if !isPlaceholder(col) {
					q.WhereCols = append(q.WhereCols, ColAccess{
						Table:  strings.ToLower(cm[1]),
						Column: col,
						Kind:   kind,
					})
				}
			}
		}

		// JOIN columns
		for _, jm := range reJoinOn.FindAllStringSubmatch(flat, -1) {
			q.JoinCols = append(q.JoinCols,
				ColAccess{Table: strings.ToLower(jm[2]), Column: strings.ToLower(jm[3])},
				ColAccess{Table: strings.ToLower(jm[4]), Column: strings.ToLower(jm[5])},
			)
		}

		// ORDER BY columns
		if om := reOrderBy.FindStringSubmatch(flat); om != nil {
			for _, cm := range reOrderCol.FindAllStringSubmatch(om[1], -1) {
				col := strings.ToLower(cm[2])
				if col != "" && !isPlaceholder(col) && !isKeyword(col) {
					q.OrderByCols = append(q.OrderByCols, col)
				}
			}
		}

		// GROUP BY columns
		if gm := reGroupBy.FindStringSubmatch(flat); gm != nil {
			for _, c := range splitCols(gm[1]) {
				if !isPlaceholder(c) {
					q.GroupByCols = append(q.GroupByCols, c)
				}
			}
		}

		queries = append(queries, q)
	}

	return queries
}

// ── Analysis ─────────────────────────────────────────────────────────────────

func analyze(tables map[string]*Table, queries []Query) []Finding {
	var findings []Finding

	// Build: table -> column -> []query names that access it
	type colKey struct{ table, col string }
	whereAccess := map[colKey][]string{}
	joinAccess  := map[colKey][]string{}
	orderAccess := map[colKey][]string{}

	// queryFromTables[queryName] = set of canonical table names the query touches
	queryFromTables := map[string]map[string]bool{}

	for _, q := range queries {
		set := map[string]bool{}
		for _, canonical := range q.FromTables {
			set[canonical] = true
		}
		queryFromTables[q.Name] = set

		for _, ca := range q.WhereCols {
			// Resolve alias to canonical table name if possible
			table := ca.Table
			if table != "" {
				if resolved, ok := q.FromTables[table]; ok {
					table = resolved
				}
			}
			k := colKey{table, ca.Column}
			whereAccess[k] = appendUniq(whereAccess[k], q.Name)
		}
		for _, ca := range q.JoinCols {
			table := ca.Table
			if table != "" {
				if resolved, ok := q.FromTables[table]; ok {
					table = resolved
				}
			}
			k := colKey{table, ca.Column}
			joinAccess[k] = appendUniq(joinAccess[k], q.Name)
		}
		for _, col := range q.OrderByCols {
			k := colKey{"", col}
			orderAccess[k] = appendUniq(orderAccess[k], q.Name)
		}
	}

	for _, t := range tables {
		// Track which index columns exist
		indexedCols := map[string]bool{}
		for _, col := range t.PKCols {
			indexedCols[col] = true
		}
		for _, idx := range t.Indexes {
			for _, col := range idx.Columns {
				indexedCols[col] = true
			}
		}

		// Check FK columns missing indexes — only flag if actually queried
		for _, fk := range t.FKCols {
			if indexedCols[fk] {
				continue
			}
			var refs []string
			for k, qnames := range whereAccess {
				if k.col != fk {
					continue
				}
				if k.table == t.Name {
					refs = append(refs, qnames...)
				} else if k.table == "" {
					for _, qn := range qnames {
						if queryFromTables[qn][t.Name] {
							refs = appendUniq(refs, qn)
						}
					}
				}
			}
			for k, qnames := range joinAccess {
				if k.col != fk {
					continue
				}
				if k.table == t.Name {
					refs = append(refs, qnames...)
				} else if k.table == "" {
					for _, qn := range qnames {
						if queryFromTables[qn][t.Name] {
							refs = appendUniq(refs, qn)
						}
					}
				}
			}
			if len(refs) == 0 {
				continue
			}
			indexedCols[fk] = true
			if isLowCardinality(t, fk) {
				findings = append(findings, Finding{
					Table:   t.Name,
					Level:   "WARNING",
					Message: fmt.Sprintf("FK column '%s' is low cardinality (boolean) — standard index unlikely to help; consider a partial index", fk),
					Queries: refs,
				})
			} else {
				findings = append(findings, Finding{
					Table:   t.Name,
					Level:   "MISSING",
					Message: fmt.Sprintf("FK column '%s' has no index — used in WHERE/JOIN", fk),
					Queries: refs,
					SQL:     fmt.Sprintf("CREATE INDEX CONCURRENTLY idx_%s_%s ON %s (%s);", t.Name, fk, t.Name, fk),
				})
			}
		}

		// Check WHERE columns missing indexes
		for k, allQueryNames := range whereAccess {
			if k.table != "" && k.table != t.Name {
				continue
			}
			var queryNames []string
			if k.table == t.Name {
				queryNames = allQueryNames
			} else {
				// unqualified — only count queries that actually FROM this table
				if !tableHasColumn(t, k.col) {
					continue
				}
				for _, qn := range allQueryNames {
					if queryFromTables[qn][t.Name] {
						queryNames = appendUniq(queryNames, qn)
					}
				}
				if len(queryNames) == 0 {
					continue
				}
			}
			if !indexedCols[k.col] && !isPK(t, k.col) {
				indexedCols[k.col] = true
				if isLowCardinality(t, k.col) {
					findings = append(findings, Finding{
						Table:   t.Name,
						Level:   "WARNING",
						Message: fmt.Sprintf("Column '%s' is low cardinality (boolean) — standard index unlikely to help; consider a partial index", k.col),
						Queries: queryNames,
					})
				} else {
					findings = append(findings, Finding{
						Table:   t.Name,
						Level:   "MISSING",
						Message: fmt.Sprintf("Column '%s' used in WHERE but has no index", k.col),
						Queries: queryNames,
						SQL:     fmt.Sprintf("CREATE INDEX CONCURRENTLY idx_%s_%s ON %s (%s);", t.Name, k.col, t.Name, k.col),
					})
				}
			}
		}

		// Check JOIN columns missing indexes
		for k, allQueryNames := range joinAccess {
			if k.table != "" && k.table != t.Name {
				continue
			}
			var queryNames []string
			if k.table == t.Name {
				queryNames = allQueryNames
			} else {
				if !tableHasColumn(t, k.col) {
					continue
				}
				for _, qn := range allQueryNames {
					if queryFromTables[qn][t.Name] {
						queryNames = appendUniq(queryNames, qn)
					}
				}
				if len(queryNames) == 0 {
					continue
				}
			}
			if !indexedCols[k.col] && !isPK(t, k.col) {
				indexedCols[k.col] = true
				if isLowCardinality(t, k.col) {
					findings = append(findings, Finding{
						Table:   t.Name,
						Level:   "WARNING",
						Message: fmt.Sprintf("Column '%s' is low cardinality (boolean) — standard index unlikely to help; consider a partial index", k.col),
						Queries: queryNames,
					})
				} else {
					findings = append(findings, Finding{
						Table:   t.Name,
						Level:   "MISSING",
						Message: fmt.Sprintf("Column '%s' used in JOIN ON but has no index", k.col),
						Queries: queryNames,
						SQL:     fmt.Sprintf("CREATE INDEX CONCURRENTLY idx_%s_%s ON %s (%s);", t.Name, k.col, t.Name, k.col),
					})
				}
			}
		}

		// Warn on low-cardinality indexes (boolean / small status enums)
		for _, idx := range t.Indexes {
			for _, col := range idx.Columns {
				colType := getColType(t, col)
				if colType == "boolean" || colType == "bool" {
					findings = append(findings, Finding{
						Table:   t.Name,
						Level:   "WARNING",
						Message: fmt.Sprintf("Index '%s' on boolean column '%s' — likely low cardinality, may not help query planner", idx.Name, col),
					})
				}
			}
		}

		// Detect redundant indexes: index on (a) when (a, b) exists
		for _, idx := range t.Indexes {
			if len(idx.Columns) == 1 {
				col := idx.Columns[0]
				for _, other := range t.Indexes {
					if other.Name != idx.Name && len(other.Columns) > 1 && other.Columns[0] == col {
						findings = append(findings, Finding{
							Table:   t.Name,
							Level:   "REDUNDANT",
							Message: fmt.Sprintf("Index '%s' on (%s) may be redundant — '%s' on (%s) already covers it as leading column", idx.Name, col, other.Name, strings.Join(other.Columns, ", ")),
						})
						break
					}
				}
			}
		}
	}

	return findings
}

// ── Reporting ─────────────────────────────────────────────────────────────────

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
	colorGreen  = "\033[32m"
	colorBold   = "\033[1m"
	colorDim    = "\033[2m"
)

func printReport(findings []Finding, tables map[string]*Table, queries []Query, noColor bool) {
	color := func(c, s string) string {
		if noColor {
			return s
		}
		return c + s + colorReset
	}

	byTable := map[string][]Finding{}
	for _, f := range findings {
		byTable[f.Table] = append(byTable[f.Table], f)
	}

	fmt.Println()
	fmt.Println(color(colorBold, "╔══════════════════════════════════════════╗"))
	fmt.Println(color(colorBold, "║         INDEXLENS — DB Index Audit       ║"))
	fmt.Println(color(colorBold, "╚══════════════════════════════════════════╝"))
	fmt.Println()

	missing, warnings, redundant := 0, 0, 0
	for _, f := range findings {
		switch f.Level {
		case "MISSING":
			missing++
		case "WARNING":
			warnings++
		case "REDUNDANT":
			redundant++
		}
	}

	fmt.Printf("  Tables analyzed : %s\n", color(colorBold, fmt.Sprintf("%d", len(tables))))
	fmt.Printf("  Queries analyzed: %s\n", color(colorBold, fmt.Sprintf("%d", len(queries))))
	fmt.Printf("  Missing indexes : %s\n", color(colorRed, fmt.Sprintf("%d", missing)))
	fmt.Printf("  Warnings        : %s\n", color(colorYellow, fmt.Sprintf("%d", warnings)))
	fmt.Printf("  Redundant       : %s\n", color(colorCyan, fmt.Sprintf("%d", redundant)))
	fmt.Println()

	if len(findings) == 0 {
		fmt.Println(color(colorGreen, "  ✓ No issues found."))
		fmt.Println()
		return
	}

	for tableName, tfindings := range byTable {
		fmt.Println(color(colorBold, fmt.Sprintf("  TABLE: %s", strings.ToUpper(tableName))))
		fmt.Println(color(colorDim, "  "+strings.Repeat("─", 50)))

		for _, f := range tfindings {
			var prefix string
			switch f.Level {
			case "MISSING":
				prefix = color(colorRed, "  [MISSING]  ")
			case "WARNING":
				prefix = color(colorYellow, "  [WARNING]  ")
			case "REDUNDANT":
				prefix = color(colorCyan, "  [REDUNDANT]")
			}
			fmt.Printf("%s %s\n", prefix, f.Message)
			if len(f.Queries) > 0 {
				fmt.Printf("             %s %s\n", color(colorDim, "queries:"), color(colorDim, strings.Join(f.Queries, ", ")))
			}
			if f.SQL != "" {
				fmt.Printf("             %s\n", color(colorGreen, f.SQL))
			}
		}
		fmt.Println()
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func splitCols(s string) []string {
	var cols []string
	for _, c := range strings.Split(s, ",") {
		c = strings.TrimSpace(c)
		// strip sort direction
		c = strings.Fields(c)[0]
		c = strings.ToLower(c)
		if c != "" {
			cols = append(cols, c)
		}
	}
	return cols
}

func appendUniq(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}

func tableHasColumn(t *Table, col string) bool {
	for _, c := range t.Columns {
		if c.Name == col {
			return true
		}
	}
	return false
}

func isPK(t *Table, col string) bool {
	for _, pk := range t.PKCols {
		if pk == col {
			return true
		}
	}
	return false
}

func getColType(t *Table, col string) string {
	for _, c := range t.Columns {
		if c.Name == col {
			return strings.ToLower(c.Type)
		}
	}
	return ""
}

func isLowCardinality(t *Table, col string) bool {
	ct := getColType(t, col)
	return ct == "boolean" || ct == "bool"
}

func isPlaceholder(s string) bool {
	return strings.HasPrefix(s, "$") || s == "now()" || s == "true" || s == "false" || s == "null"
}

var sqlKeywords = map[string]bool{
	"select": true, "from": true, "where": true, "and": true, "or": true,
	"not": true, "in": true, "is": true, "null": true, "like": true,
	"ilike": true, "between": true, "exists": true, "any": true, "all": true,
	"case": true, "when": true, "then": true, "else": true, "end": true,
	"over": true, "count": true, "sum": true, "avg": true, "min": true, "max": true,
	"coalesce": true, "distinct": true, "as": true, "on": true, "join": true,
	"inner": true, "left": true, "right": true, "outer": true, "full": true,
	"having": true, "limit": true, "offset": true, "returning": true,
	"primary": true, "foreign": true, "key": true, "references": true,
	"constraint": true, "unique": true, "default": true,
	"cascade": true, "set": true, "delete": true, "update": true, "insert": true,
}

func isKeyword(s string) bool {
	return sqlKeywords[strings.ToLower(s)]
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	schemasDir := flag.String("schemas", "./server/internal/db/schemas", "path to schema SQL files")
	queriesDir := flag.String("queries", "./server/internal/db/query", "path to query SQL files")
	outputFile := flag.String("output", "", "write JSON report to this file (optional)")
	noColor    := flag.Bool("no-color", false, "disable terminal colors")
	flag.Parse()

	// Verify we're in a Go project root
	if _, err := os.Stat("go.mod"); err != nil {
		fmt.Fprintln(os.Stderr, "error: no go.mod found — run from project root")
		os.Exit(1)
	}

	tables, err := parseSchemas(*schemasDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading schemas: %v\n", err)
		os.Exit(1)
	}

	queries, err := parseQueries(*queriesDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading queries: %v\n", err)
		os.Exit(1)
	}

	findings := analyze(tables, queries)
	printReport(findings, tables, queries, *noColor)

	if *outputFile != "" {
		missing, warnings, redundant := 0, 0, 0
		for _, f := range findings {
			switch f.Level {
			case "MISSING":
				missing++
			case "WARNING":
				warnings++
			case "REDUNDANT":
				redundant++
			}
		}
		report := Report{
			Findings: findings,
			Summary: Summary{
				TablesAnalyzed:  len(tables),
				QueriesAnalyzed: len(queries),
				MissingIndexes:  missing,
				Warnings:        warnings,
				Redundant:       redundant,
			},
		}
		data, _ := json.MarshalIndent(report, "", "  ")
		if err := os.WriteFile(*outputFile, data, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "error writing output file: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  JSON report written to %s\n\n", *outputFile)
	}
}
