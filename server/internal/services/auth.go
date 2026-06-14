package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/crizah/Onion/app"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db        *sql.DB     // Needed to start transactions
	Queries   *db.Queries // The sqlc query wrapper
	JwtSecret []byte
	onionApp  *app.App
}

func NewAuthService(dbConn *sql.DB, s []byte, oa *app.App) *AuthService {
	return &AuthService{
		db:        dbConn,
		Queries:   db.New(dbConn),
		JwtSecret: s,
		onionApp:  oa,
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
		Status:      db.NullUserStatus{UserStatus: db.UserStatusACTIVE},
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
	// util.ParseUUID is assuming you have a helper to convert the string to pgtype.UUID or uuid.UUID
	parsedUUID := util.ParseUUID(orgID)
	return s.Queries.GetOrganizationName(ctx, parsedUUID)
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

	// Fetch user roles
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

	// 4. Generate and return the Access JWT
	JwtSecret := s.JwtSecret

	// Assuming user.Role is generated as a custom enum type by sqlc, we cast it to string
	token, err := util.GenerateAccessToken(
		user.ID.String(),
		user.OrgID.String(),
		activeRole,
		req.Email,
		JwtSecret,
		24*time.Hour, // 1-day expiration
	)
	if err != nil {
		return "", errors.New("failed to generate authentication token")
	}

	return token, nil
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
	claims, err := util.ParseInviteToken(req.Token, []byte("your-super-secret-key"))
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
		EmailID:     claims.Email, // Extracted safely from the signed JWT, not user input!
		// status already active here
	})
	if err != nil {
		return errors.New("failed to update user profile or invite already accepted")
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
