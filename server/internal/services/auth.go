package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/crizah/Onion/app"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db             *sql.DB
	Queries        *db.Queries
	JwtSecret      []byte
	GoogleClientID string
	onionApp       *app.App
	rdb            *redis.Client
}

func NewAuthService(dbConn *sql.DB, s []byte, googleClientID string, oa *app.App, rdb *redis.Client) *AuthService {
	return &AuthService{
		db:             dbConn,
		Queries:        db.New(dbConn),
		JwtSecret:      s,
		GoogleClientID: googleClientID,
		onionApp:       oa,
		rdb:            rdb,
	}
}

// RegisterOrganization supports two paths under multi-org membership:
//   - a brand-new email registers a brand-new shared identity, becoming the
//     new org's SUPER_ADMIN (today's behavior).
//   - an email that already has an Abhiyan identity (from another org) can
//     spin up an additional org self-serve, becoming ITS SUPER_ADMIN too —
//     but only once their password is verified against the existing account,
//     so this can't be used to attach an org to someone else's identity.
//     Their existing shared profile/credentials are left untouched.
func (s *AuthService) RegisterOrganization(ctx context.Context, req schemas.RegisterOrgRequest) error {
	if !util.IsValidPhoneNumber(req.AdminPhone) {
		return errors.New("phone number must be a 10-digit number without the country code")
	}

	// Emails are case-insensitive; normalize before it ever touches the DB so
	// "Jane@co.com" and "jane@co.com" can't become two different accounts.
	adminEmail := strings.ToLower(strings.TrimSpace(req.AdminEmail))

	// Checked up front, outside any transaction, so we only pay for the slow
	// bcrypt hash when we actually need a brand-new credentials row.
	existingUser, err := s.Queries.GetUserByEmail(ctx, adminEmail)
	isExisting := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	var hashedPassword string
	if isExisting {
		creds, credErr := s.Queries.GetUserCredentials(ctx, existingUser.ID)
		if credErr != nil || !util.CheckPassword(req.AdminPassword, creds.PasswordHash) {
			// Same non-committal message as Login — don't confirm whether the email exists.
			return errors.New("invalid email or password")
		}
	} else {
		hp, hashErr := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			return hashErr
		}
		hashedPassword = string(hp)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() // Safe to call; does nothing if already committed

	qtx := s.Queries.WithTx(tx)

	org, err := qtx.CreateOrganizations(ctx, db.CreateOrganizationsParams{
		Name: req.OrgName,
		Domain: sql.NullString{
			String: req.OrgDomain,
			Valid:  req.OrgDomain != "", // If req.OrgDomain is empty, Postgres gets a true NULL
		},
	})
	if err != nil {
		return err
	}

	var userID uuid.UUID
	if isExisting {
		userID = existingUser.ID
	} else {
		newUser, err := qtx.CreateUser(ctx, db.CreateUserParams{
			FirstName:   sql.NullString{String: req.AdminFirstName, Valid: true},
			LastName:    sql.NullString{String: req.AdminLastName, Valid: req.AdminLastName != ""},
			EmailID:     adminEmail,
			PhoneNumber: sql.NullString{String: req.AdminPhone, Valid: true},
		})
		if err != nil {
			return err
		}
		if _, err := qtx.CreateUserCredentials(ctx, db.CreateUserCredentialsParams{
			UserID:       newUser.ID,
			PasswordHash: hashedPassword,
		}); err != nil {
			return err
		}
		userID = newUser.ID
	}

	if _, err := qtx.CreateOrgMembership(ctx, db.CreateOrgMembershipParams{
		UserID: userID,
		OrgID:  org.ID,
		Status: db.UserStatusACTIVE,
	}); err != nil {
		return err
	}

	if _, err := qtx.AddUserSystemRole(ctx, db.AddUserSystemRoleParams{
		UserID: userID,
		OrgID:  uuid.NullUUID{UUID: org.ID, Valid: true},
		Role:   db.SystemRoleSUPERADMIN,
	}); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *AuthService) GetOrganizationName(ctx context.Context, orgID string) (string, error) {
	parsedUUID := util.ParseUUID(orgID)
	return s.Queries.GetOrganizationName(ctx, parsedUUID)
}

func (s *AuthService) GetOrgInfo(ctx context.Context, orgID string) (db.GetOrgInfoRow, error) {
	parsedUUID := util.ParseUUID(orgID)
	return s.Queries.GetOrgInfo(ctx, parsedUUID)
}

// LoginResult covers both outcomes of a successful credential check: a
// single-org account gets a session token immediately; a multi-org account
// gets a short-lived pending token and the list of orgs to choose from
// instead (no session cookie yet — see AuthService.SelectOrg).
type LoginResult struct {
	Token                string
	RequiresOrgSelection bool
	PendingToken         string
	Orgs                 []schemas.OrgOption
}

func (s *AuthService) Login(ctx context.Context, req schemas.LoginRequest) (*LoginResult, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))

	// 1. Fetch User by Email
	user, err := s.Queries.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid email or password")
		}
		return nil, err
	}

	// 2. Fetch User Credentials by User ID
	creds, err := s.Queries.GetUserCredentials(ctx, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// This happens if an INVITED user tries to log in before accepting the invite
			return nil, errors.New("account setup incomplete: please check your email for the invite link")
		}
		return nil, err
	}

	// 3. Compare the provided password against the stored hash
	isValid := util.CheckPassword(req.Password, creds.PasswordHash)
	if !isValid {
		return nil, errors.New("invalid email or password")
	}

	// 4. Issue a session immediately (1 org) or ask which org to use (2+)
	return s.completeLogin(ctx, user.ID, email)
}

// completeLogin is the shared tail of every login path (password, Google,
// and the org-selection follow-up) — decides single-org-immediate vs
// multi-org-picker and mints the appropriate result.
func (s *AuthService) completeLogin(ctx context.Context, userID uuid.UUID, email string) (*LoginResult, error) {
	memberships, err := s.Queries.GetUserOrgMemberships(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(memberships) == 0 {
		return nil, errors.New("account setup incomplete: please check your email for the invite link")
	}

	if len(memberships) == 1 {
		token, err := s.issueAccessToken(ctx, userID, memberships[0].OrgID, email)
		if err != nil {
			return nil, errors.New("failed to generate authentication token")
		}
		return &LoginResult{Token: token}, nil
	}

	pendingToken, err := util.GenerateOrgSelectionToken(userID.String(), s.JwtSecret, 5*time.Minute)
	if err != nil {
		return nil, errors.New("failed to generate authentication token")
	}

	orgs := make([]schemas.OrgOption, len(memberships))
	for i, m := range memberships {
		orgs[i] = schemas.OrgOption{OrgID: m.OrgID.String(), OrgName: m.OrgName, Roles: util.ParsePGTextArray(m.Roles)}
	}

	return &LoginResult{RequiresOrgSelection: true, PendingToken: pendingToken, Orgs: orgs}, nil
}

// SelectOrg completes a login that required org selection: verifies the
// short-lived pending token and that the chosen org is one the person
// actually belongs to, then mints the real session token.
func (s *AuthService) SelectOrg(ctx context.Context, pendingToken string, orgID string) (string, error) {
	claims, err := util.ParseOrgSelectionToken(pendingToken, s.JwtSecret)
	if err != nil {
		return "", errors.New("invalid or expired selection, please log in again")
	}
	userID := util.ParseUUID(claims.UserID)
	targetOrgID := util.ParseUUID(orgID)

	belongs, err := s.Queries.IsUserInOrg(ctx, db.IsUserInOrgParams{UserID: userID, OrgID: targetOrgID})
	if err != nil {
		return "", err
	}
	if !belongs {
		return "", errors.New("you do not belong to this organization")
	}

	email, err := s.Queries.GetEmailByUser(ctx, userID)
	if err != nil {
		return "", err
	}

	token, err := s.issueAccessToken(ctx, userID, targetOrgID, email)
	if err != nil {
		return "", errors.New("failed to generate authentication token")
	}
	return token, nil
}

// LoginWithGoogle authenticates a user via a Google Sign-In ID token.
// Because the API Lambda has no outbound internet access, it cannot call
// Google directly. Instead it enqueues a verify_google_token job on the
// dedicated auth queue, then polls Redis for the result written by the ECS
// worker (which does have internet access).
func (s *AuthService) LoginWithGoogle(ctx context.Context, credential string) (*LoginResult, error) {
	jobID := uuid.New().String()
	resultKey := "google_auth:" + jobID

	if err := s.onionApp.Enqueue(ctx, "verify_google_token", map[string]any{
		"job_id":     jobID,
		"credential": credential,
	}); err != nil {
		return nil, fmt.Errorf("failed to queue google token verification: %w", err)
	}

	// Poll Redis until the worker writes a result or we time out.
	// 250ms intervals × 40 = 10 seconds max wait.
	const pollInterval = 250 * time.Millisecond
	const maxWait = 10 * time.Second
	deadline := time.Now().Add(maxWait)

	for time.Now().Before(deadline) {
		val, err := s.rdb.Get(ctx, resultKey).Result()
		if err == nil {
			var result struct {
				Email string `json:"email"`
				Error string `json:"error"`
			}
			if jsonErr := json.Unmarshal([]byte(val), &result); jsonErr != nil {
				return nil, errors.New("invalid google credential")
			}
			if result.Error != "" {
				return nil, errors.New(result.Error)
			}

			result.Email = strings.ToLower(strings.TrimSpace(result.Email))

			// Token verified — now apply the same DB preconditions as password login.
			user, dbErr := s.Queries.GetUserByEmail(ctx, result.Email)
			if dbErr != nil {
				if errors.Is(dbErr, sql.ErrNoRows) {
					return nil, errors.New("no account found for this email")
				}
				return nil, dbErr
			}

			if _, credErr := s.Queries.GetUserCredentials(ctx, user.ID); credErr != nil {
				if errors.Is(credErr, sql.ErrNoRows) {
					return nil, errors.New("account setup incomplete: please check your email for the invite link")
				}
				return nil, credErr
			}

			return s.completeLogin(ctx, user.ID, result.Email)
		}

		time.Sleep(pollInterval)
	}

	log.Printf("google login timed out waiting for worker result (job_id=%s)", jobID)
	return nil, errors.New("google verification timed out, please try again")
}

// issueAccessToken mints the session JWT shared by every login path
// (password or Google), after that path has already proven identity.
func (s *AuthService) issueAccessToken(ctx context.Context, userID uuid.UUID, orgID uuid.UUID, email string) (string, error) {
	roles, err := s.Queries.GetUserSystemRoles(ctx, db.GetUserSystemRolesParams{
		UserID: userID,
		OrgID:  uuid.NullUUID{UUID: orgID, Valid: true},
	})
	if err != nil || len(roles) == 0 {
		return "", errors.New("user has no assigned roles in this organization")
	}

	// Determine the highest priority role to act as their "Active" session role
	// (We default to the highest power they possess upon login)
	activeRole := "EMPLOYEE"
	for _, r := range roles {
		roleStr := string(r)
		if roleStr == "SUPER_ADMIN" {
			activeRole = "SUPER_ADMIN"
			break // Highest possible, stop checking
		} else if roleStr == "ADMIN" {
			activeRole = "ADMIN"
		}
	}

	return util.GenerateAccessToken(
		userID.String(),
		orgID.String(),
		activeRole,
		email,
		s.JwtSecret,
		24*time.Hour, // 1-day expiration
	)
}

// // --- Invite User (Admin Only) ---
// func (s *AuthService) InviteUser(ctx context.Context, adminOrgID string, req schemas.InviteUserRequest) (string, error) {

// 	tx, err := s.db.BeginTx(ctx, nil)
// 	if err != nil {
// 		return "", err
// 	}
// 	defer tx.Rollback()

// 	qtx := s.Queries.WithTx(tx)
// 	// 1. Insert user into DB as INVITED
// 	// (Assumes org_id maps to UUID)
// 	user, err := s.Queries.CreateInvitedUser(ctx, db.CreateInvitedUserParams{
// 		OrgID:   util.ParseUUID(adminOrgID), // You may need a quick uuid.Parse() helper here
// 		EmailID: req.Email,
// 		// Role:    db.UserRole(req.Role),
// 	})
// 	if err != nil {
// 		return "", errors.New("user with this email may already exist")
// 	}

// 	// 2. NEW: Assign the requested role
// 	_, err = qtx.AddUserSystemRole(ctx, db.AddUserSystemRoleParams{
// 		UserID: user.ID,
// 		Role:   db.SystemRole(req.Role),
// 	})
// 	if err != nil {
// 		return "", err
// 	}

// 	if err := tx.Commit(); err != nil {
// 		return "", err
// 	}

// 	// 2. Generate the Invite Token (Valid for 48 hours)
// 	token, err := util.GenerateInviteToken(
// 		user.EmailID,
// 		adminOrgID,
// 		req.Role,
// 		s.JwtSecret,
// 		48*time.Hour,
// 	)
// 	if err != nil {
// 		return "", err
// 	}
// 	frontendURL := os.Getenv("FRONTEND_URL")
// 	link := fmt.Sprintf("%s/accept-invite?token=%s", frontendURL, token)

// 	// push the job to queue
// 	s.onionApp.Enqueue(ctx, "send_invite_email", map[string]any{"email": req.Email, "link": link})

// 	return token, nil // Returning token for easy testing in Postman
// }

// PreviewInvite lets the FE decide which accept-invite form to render before
// anything is submitted: a brand-new identity needs the full name/phone/
// password form; someone who already has an Abhiyan account (invited into a
// 2nd+ org) just needs a lightweight confirm.
func (s *AuthService) PreviewInvite(ctx context.Context, token string) (*schemas.InvitePreviewResponse, error) {
	claims, err := util.ParseInviteToken(token, s.JwtSecret)
	if err != nil {
		return nil, errors.New("invalid or expired invite link")
	}

	orgName, err := s.Queries.GetOrganizationName(ctx, util.ParseUUID(claims.OrgID))
	if err != nil {
		return nil, errors.New("invalid or expired invite link")
	}

	isExistingUser := false
	if user, err := s.Queries.GetUserByEmail(ctx, claims.Email); err == nil {
		if _, credErr := s.Queries.GetUserCredentials(ctx, user.ID); credErr == nil {
			isExistingUser = true
		}
	}

	return &schemas.InvitePreviewResponse{
		Email:          claims.Email,
		OrgName:        orgName,
		IsExistingUser: isExistingUser,
	}, nil
}

// AcceptInvite activates the invited org membership. The identity/membership
// row already exists (created at invite time by AdminService.InviteUser) —
// this only sets a password/profile the FIRST time a person ever accepts any
// invite; someone accepting a 2nd+ org's invite keeps their existing
// credentials and profile untouched, only that new membership gets activated.
func (s *AuthService) AcceptInvite(ctx context.Context, req schemas.AcceptInviteRequest) error {
	// 1. Parse and validate the JWT from the URL
	claims, err := util.ParseInviteToken(req.Token, s.JwtSecret)
	if err != nil {
		return errors.New("invalid or expired invite link")
	}
	orgID := util.ParseUUID(claims.OrgID)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.Queries.WithTx(tx)

	user, err := qtx.GetUserByEmail(ctx, claims.Email)
	if err != nil {
		return errors.New("invalid or expired invite link")
	}

	_, credErr := qtx.GetUserCredentials(ctx, user.ID)
	isNewIdentity := errors.Is(credErr, sql.ErrNoRows)

	if isNewIdentity {
		if !util.IsValidPhoneNumber(req.Phone) {
			return errors.New("phone number must be a 10-digit number without the country code")
		}
		if req.FirstName == "" || len(req.NewPassword) < 8 {
			return errors.New("first name and a password (min 8 characters) are required")
		}

		hashedPassword, err := util.HashPassword(req.NewPassword)
		if err != nil {
			return err
		}

		if _, err := qtx.UpdateUserOnboarding(ctx, db.UpdateUserOnboardingParams{
			FirstName:   sql.NullString{String: req.FirstName, Valid: true},
			LastName:    sql.NullString{String: req.LastName, Valid: req.LastName != ""},
			PhoneNumber: sql.NullString{String: req.Phone, Valid: true},
			EmailID:     claims.Email, // Extracted safely from the signed JWT, not user input!
		}); err != nil {
			return err
		}

		if _, err := qtx.CreateUserCredentials(ctx, db.CreateUserCredentialsParams{
			UserID:       user.ID,
			PasswordHash: hashedPassword,
		}); err != nil {
			return err
		}
	}

	if err := qtx.UpdateMembershipStatus(ctx, db.UpdateMembershipStatusParams{
		Status: db.UserStatusACTIVE,
		UserID: user.ID,
		OrgID:  orgID,
	}); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	user, err := s.Queries.GetUserByEmail(ctx, email)
	if err != nil {
		// Return nil to avoid leaking whether the email exists
		return nil
	}

	token, err := util.GeneratePasswordResetToken(user.EmailID, s.JwtSecret, 15*time.Minute)
	if err != nil {
		return err
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	link := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, token)
	return s.onionApp.Enqueue(ctx, "send_password_reset_email", map[string]any{"email": user.EmailID, "link": link})
}

func (s *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error {
	claims, err := util.ParsePasswordResetToken(token, s.JwtSecret)
	if err != nil {
		return errors.New("invalid or expired reset link")
	}

	user, err := s.Queries.GetUserByEmail(ctx, claims.Email)
	if err != nil {
		return errors.New("user not found")
	}

	hashedPassword, err := util.HashPassword(newPassword)
	if err != nil {
		return err
	}

	return s.Queries.UpdateUserCredentials(ctx, db.UpdateUserCredentialsParams{
		UserID:       user.ID,
		PasswordHash: hashedPassword,
	})
}

func (s *AuthService) ResendPublicInvite(ctx context.Context, expiredToken string) error {
	// 1. Safely extract claims from the expired-but-validly-signed token
	claims, err := util.ParseInviteToken(expiredToken, s.JwtSecret)
	if err != nil {
		return err // Fails if tampered with
	}

	// 2. Fetch the user to ensure they exist and haven't already accepted an invite
	user, err := s.Queries.GetPendingInvitedUser(ctx, db.GetPendingInvitedUserParams{
		EmailID: claims.Email,
		OrgID:   util.ParseUUID(claims.OrgID),
	})
	if err != nil {
		return errors.New("could not verify original invite record")
	}

	if user.Status == db.UserStatusACTIVE {
		return errors.New("this account is already active, please log in")
	}

	// 3. Generate a brand new token
	newToken, err := util.GenerateInviteToken(user.EmailID, user.OrgID.String(), string(user.Role), s.JwtSecret, 48*time.Hour)
	if err != nil {
		return err
	}

	orgName, err := s.Queries.GetOrganizationName(ctx, user.OrgID)
	if err != nil {
		return err
	}

	// 4. Enqueue the email
	frontendURL := os.Getenv("FRONTEND_URL")
	link := fmt.Sprintf("%s/accept-invite?token=%s", frontendURL, newToken)
	err = s.onionApp.Enqueue(ctx, "send_invite_email", map[string]any{"email": user.EmailID, "orgName": orgName, "link": link})

	return err
}
