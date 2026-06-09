package services

import (
	"context"
	"database/sql"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"

	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db      *sql.DB     // Needed to start transactions
	queries *db.Queries // The sqlc query wrapper
}

func NewAuthService(dbConn *sql.DB) *AuthService {
	return &AuthService{
		db:      dbConn,
		queries: db.New(dbConn),
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
		Role: db.NullUserRole{
			UserRole: db.UserRoleSUPERADMIN,
			Valid:    true,
		},
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

// Stub for Login
func (s *AuthService) Login(ctx context.Context, req schemas.LoginRequest) (string, error) {
	// 1. Fetch User by Email
	// 2. Fetch User Credentials by User ID
	// 3. bcrypt.CompareHashAndPassword()
	// 4. If valid, generate and return JWT

	// After verifying CheckPassword(req.Password, userCreds.PasswordHash) is true...
	// token, err := util.GenerateAccessToken(
	// 	user.ID.String(),
	// 	user.OrgID.String(),
	// 	string(user.Role),
	// 	[]byte("your-super-secret-key"),
	// 	24*time.Hour, // Standard 1-day expiration
	// )

	return "mock_jwt_token", nil
}
