package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"

	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db        *sql.DB     // Needed to start transactions
	queries   *db.Queries // The sqlc query wrapper
	jwtSecret []byte
}

func NewAuthService(dbConn *sql.DB, s []byte) *AuthService {
	return &AuthService{
		db:        dbConn,
		queries:   db.New(dbConn),
		jwtSecret: s,
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
	qtx := s.queries.WithTx(tx)

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
		FirstName:   req.AdminFirstName,
		LastName:    sql.NullString{String: req.AdminLastName, Valid: req.AdminLastName != ""},
		EmailID:     req.AdminEmail,
		PhoneNumber: req.AdminPhone,
		Role:        db.UserRoleSUPERADMIN,
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
func (s *AuthService) Login(ctx context.Context, req schemas.LoginRequest) (string, error) {
	// 1. Fetch User by Email
	user, err := s.queries.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("invalid email or password")
		}
		return "", err
	}

	// 2. Fetch User Credentials by User ID
	creds, err := s.queries.GetUserCredentials(ctx, user.ID)
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
	// Note: In production, load the secret key from an environment variable (e.g., os.Getenv("JWT_SECRET"))
	jwtSecret := s.jwtSecret

	// Assuming user.Role is generated as a custom enum type by sqlc, we cast it to string
	token, err := util.GenerateAccessToken(
		user.ID.String(),
		user.OrgID.String(),
		string(user.Role),
		jwtSecret,
		24*time.Hour, // 1-day expiration
	)
	if err != nil {
		return "", errors.New("failed to generate authentication token")
	}

	return token, nil
}
