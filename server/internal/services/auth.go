package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
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

func (s *AuthService) RegisterOrganization(ctx context.Context, req schemas.RegisterOrgRequest) error {
	// 1. Hash the password before starting the transaction
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 2. Start Database Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() // Safe to call; does nothing if already committed

	// Bind sqlc queries to this transaction
	qtx := s.Queries.WithTx(tx)

	// 3. Create Organization
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

	// 4. Create Super Admin User (Status ACTIVE, Role SUPERADMIN)
	user, err := qtx.CreateUser(ctx, db.CreateUserParams{
		OrgID:       org.ID,
		FirstName:   sql.NullString{String: req.AdminFirstName, Valid: true},
		LastName:    sql.NullString{String: req.AdminLastName, Valid: req.AdminLastName != ""},
		EmailID:     req.AdminEmail,
		PhoneNumber: sql.NullString{String: req.AdminPhone, Valid: true},

		Status: db.NullUserStatus{UserStatus: db.UserStatusACTIVE, Valid: true},
	})
	if err != nil {
		return err
	}

	// Grant SUPER_ADMIN system role
	_, err = qtx.AddUserSystemRole(ctx, db.AddUserSystemRoleParams{
		UserID: user.ID,
		Role:   db.SystemRoleSUPERADMIN,
	})
	if err != nil {
		return err
	}

	// 5. Save Credentials
	_, err = qtx.CreateUserCredentials(ctx, db.CreateUserCredentialsParams{
		UserID:       user.ID,
		PasswordHash: string(hashedPassword),
	})
	if err != nil {
		return err
	}

	// 6. Commit transaction
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

func (s *AuthService) Login(ctx context.Context, req schemas.LoginRequest) (string, error) {
	// 1. Fetch User by Email
	user, err := s.Queries.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("invalid email or password")
		}
		return "", err
	}

	// 2. Fetch User Credentials by User ID
	creds, err := s.Queries.GetUserCredentials(ctx, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// This happens if an INVITED user tries to log in before accepting the invite
			return "", errors.New("account setup incomplete: please check your email for the invite link")
		}
		return "", err
	}

	// 3. Compare the provided password against the stored hash
	isValid := util.CheckPassword(req.Password, creds.PasswordHash)
	if !isValid {
		return "", errors.New("invalid email or password")
	}

	// 4. Generate and return the Access JWT
	token, err := s.issueAccessToken(ctx, user, req.Email)
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
func (s *AuthService) LoginWithGoogle(ctx context.Context, credential string) (string, error) {
	jobID := uuid.New().String()
	resultKey := "google_auth:" + jobID

	if err := s.onionApp.Enqueue(ctx, "verify_google_token", map[string]any{
		"job_id":     jobID,
		"credential": credential,
	}); err != nil {
		return "", fmt.Errorf("failed to queue google token verification: %w", err)
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
				return "", errors.New("invalid google credential")
			}
			if result.Error != "" {
				return "", errors.New(result.Error)
			}

			// Token verified — now apply the same DB preconditions as password login.
			user, dbErr := s.Queries.GetUserByEmail(ctx, result.Email)
			if dbErr != nil {
				if errors.Is(dbErr, sql.ErrNoRows) {
					return "", errors.New("no account found for this email")
				}
				return "", dbErr
			}

			if _, credErr := s.Queries.GetUserCredentials(ctx, user.ID); credErr != nil {
				if errors.Is(credErr, sql.ErrNoRows) {
					return "", errors.New("account setup incomplete: please check your email for the invite link")
				}
				return "", credErr
			}

			token, tokenErr := s.issueAccessToken(ctx, user, result.Email)
			if tokenErr != nil {
				return "", errors.New("failed to generate authentication token")
			}
			return token, nil
		}

		time.Sleep(pollInterval)
	}

	log.Printf("google login timed out waiting for worker result (job_id=%s)", jobID)
	return "", errors.New("google verification timed out, please try again")
}

// issueAccessToken mints the session JWT shared by every login path
// (password or Google), after that path has already proven identity.
func (s *AuthService) issueAccessToken(ctx context.Context, user db.User, email string) (string, error) {
	roles, err := s.Queries.GetUserSystemRoles(ctx, user.ID)
	if err != nil || len(roles) == 0 {
		return "", errors.New("user has no assigned roles")
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
		user.ID.String(),
		user.OrgID.String(),
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

// --- Accept Invite (Public Link) ---
func (s *AuthService) AcceptInvite(ctx context.Context, req schemas.AcceptInviteRequest) error {
	// 1. Parse and validate the JWT from the URL
	claims, err := util.ParseInviteToken(req.Token, s.JwtSecret)
	if err != nil {
		return errors.New("invalid or expired invite link")
	}

	// 2. Hash the new password
	hashedPassword, err := util.HashPassword(req.NewPassword)
	if err != nil {
		return err
	}

	// 3. Start Database Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.Queries.WithTx(tx)

	// 4. Update the User profile and flip status to ACTIVE
	user, err := qtx.UpdateUserOnboarding(ctx, db.UpdateUserOnboardingParams{
		FirstName:   sql.NullString{String: req.FirstName, Valid: true},
		LastName:    sql.NullString{String: req.LastName, Valid: req.LastName != ""},
		PhoneNumber: sql.NullString{String: req.Phone, Valid: true},
		// PhoneNumber: req.Phone,
		EmailID: claims.Email, // Extracted safely from the signed JWT, not user input!
		// status already active here
	})
	// if err != nil {
	// 	return errors.New("failed to update user profile or invite already accepted")
	// }
	if err != nil {
		return err
	}

	// 5. Insert their new password into user_credentials
	_, err = qtx.CreateUserCredentials(ctx, db.CreateUserCredentialsParams{
		UserID:       user.ID,
		PasswordHash: hashedPassword,
	})
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
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

	if user.Status.Valid && user.Status.UserStatus == db.UserStatusACTIVE {
		return errors.New("this account is already active, please log in")
	}

	// 3. Generate a brand new token
	newToken, err := util.GenerateInviteToken(user.EmailID, user.OrgID.String(), string(user.Role), s.JwtSecret, 48*time.Hour)
	if err != nil {
		return err
	}

	// 4. Enqueue the email
	frontendURL := os.Getenv("FRONTEND_URL")
	link := fmt.Sprintf("%s/accept-invite?token=%s", frontendURL, newToken)
	err = s.onionApp.Enqueue(ctx, "send_invite_email", map[string]any{"email": user.EmailID, "link": link})

	return err
}
