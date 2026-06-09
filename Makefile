DB_URL         ?= postgres://postgres:password@localhost:5432/abhiyan_dev?sslmode=disable
MIGRATIONS_DIR  = server/internal/db/migrations
BUILD_DIR = server/cmd/api
BINARY          = abhiyan.exe

build:
	go build -o $(BINARY) $(BUILD_DIR)/main.go

run:
	./$(BINARY)

# Diffs schemas/ against the current DB and generates a migration file.
# Atlas spins up a temporary Docker container as scratch — no second DB needed.
# usage: make migrate-create name=add_column_foo
migrate-create:
	atlas migrate diff $(name) \
		--dir "file://$(MIGRATIONS_DIR)" \
		--to "file://server/internal/db/schemas" \
		--dev-url "docker://postgres/15/dev"

migrate-up:
	atlas migrate apply \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--revisions-schema public

migrate-down:
	atlas migrate down 1 \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--dev-url "docker://postgres/15/dev" \
		--revisions-schema public

migrate-status:
	atlas migrate status \
		--dir "file://$(MIGRATIONS_DIR)" \
		--url "$(DB_URL)" \
		--revisions-schema public
unfuck-atlas:
	atlas migrate hash --dir "file://server/internal/db/migrations"

sqlc:
	sqlc generate -f server/sqlc.yaml

.PHONY: build run migrate-create migrate-up migrate-down migrate-status