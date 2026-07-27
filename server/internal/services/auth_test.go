package services

import (
	"context"
	"testing"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func newAuthServiceWithMock(t *testing.T) (*AuthService, sqlmock.Sqlmock) {
	t.Helper()
	mockDB, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { mockDB.Close() })

	return NewAuthService(mockDB, []byte("test-secret"), "", nil, nil), mock
}

func userRow(id, email, hash string) *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "org_id", "status", "first_name", "last_name", "email_id", "face_s3_uri", "phone_number", "created_at",
	}).AddRow(id, nil, nil, nil, nil, email, nil, nil, nil)
}

func TestLogin_SingleMembership_IssuesTokenImmediately(t *testing.T) {
	s, mock := newAuthServiceWithMock(t)
	ctx := context.Background()

	userID := "11111111-1111-1111-1111-111111111111"
	hash, err := util.HashPassword("correct-horse")
	require.NoError(t, err)

	mock.ExpectQuery("GetUserByEmail").WillReturnRows(userRow(userID, "a@b.com", hash))
	mock.ExpectQuery("GetUserCredentials").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "password_hash", "updated_at"}).AddRow(userID, hash, nil),
	)
	mock.ExpectQuery("GetUserOrgMemberships").WillReturnRows(
		sqlmock.NewRows([]string{"org_id", "org_name", "status", "roles"}).
			AddRow("22222222-2222-2222-2222-222222222222", "Only Org", "ACTIVE", "{EMPLOYEE}"),
	)
	mock.ExpectQuery("GetUserSystemRoles").WillReturnRows(
		sqlmock.NewRows([]string{"role"}).AddRow("EMPLOYEE"),
	)

	result, err := s.Login(ctx, schemas.LoginRequest{Email: "a@b.com", Password: "correct-horse"})

	require.NoError(t, err)
	require.False(t, result.RequiresOrgSelection, "a single-membership account should log straight in, no picker")
	require.NotEmpty(t, result.Token)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestLogin_MultipleMemberships_RequiresOrgSelection(t *testing.T) {
	s, mock := newAuthServiceWithMock(t)
	ctx := context.Background()

	userID := "11111111-1111-1111-1111-111111111111"
	hash, err := util.HashPassword("correct-horse")
	require.NoError(t, err)

	mock.ExpectQuery("GetUserByEmail").WillReturnRows(userRow(userID, "a@b.com", hash))
	mock.ExpectQuery("GetUserCredentials").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "password_hash", "updated_at"}).AddRow(userID, hash, nil),
	)
	mock.ExpectQuery("GetUserOrgMemberships").WillReturnRows(
		sqlmock.NewRows([]string{"org_id", "org_name", "status", "roles"}).
			AddRow("22222222-2222-2222-2222-222222222222", "Org One", "ACTIVE", "{SUPER_ADMIN}").
			AddRow("33333333-3333-3333-3333-333333333333", "Org Two", "ACTIVE", "{EMPLOYEE}"),
	)

	result, err := s.Login(ctx, schemas.LoginRequest{Email: "a@b.com", Password: "correct-horse"})

	require.NoError(t, err)
	require.True(t, result.RequiresOrgSelection)
	require.Empty(t, result.Token, "no session cookie should be issued before an org is chosen")
	require.NotEmpty(t, result.PendingToken)
	require.Len(t, result.Orgs, 2)
	require.NoError(t, mock.ExpectationsWereMet(), "no per-org role lookup should run before an org is actually selected")
}

func TestLogin_WrongPassword_RejectedBeforeMembershipLookup(t *testing.T) {
	s, mock := newAuthServiceWithMock(t)
	ctx := context.Background()

	hash, err := util.HashPassword("the-real-password")
	require.NoError(t, err)

	mock.ExpectQuery("GetUserByEmail").WillReturnRows(userRow("11111111-1111-1111-1111-111111111111", "a@b.com", hash))
	mock.ExpectQuery("GetUserCredentials").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "password_hash", "updated_at"}).AddRow("11111111-1111-1111-1111-111111111111", hash, nil),
	)

	result, err := s.Login(ctx, schemas.LoginRequest{Email: "a@b.com", Password: "guessed-wrong"})

	require.Error(t, err)
	require.Nil(t, result)
	require.Contains(t, err.Error(), "invalid email or password")
	require.NoError(t, mock.ExpectationsWereMet(), "org membership must never be queried once the password check has already failed")
}

func TestRegisterOrganization_ExistingEmailWrongPassword_Rejected(t *testing.T) {
	s, mock := newAuthServiceWithMock(t)
	ctx := context.Background()

	existingHash, err := util.HashPassword("their-real-password")
	require.NoError(t, err)

	mock.ExpectQuery("GetUserByEmail").WillReturnRows(
		userRow("11111111-1111-1111-1111-111111111111", "existing@example.com", existingHash),
	)
	mock.ExpectQuery("GetUserCredentials").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "password_hash", "updated_at"}).
			AddRow("11111111-1111-1111-1111-111111111111", existingHash, nil),
	)

	err = s.RegisterOrganization(ctx, schemas.RegisterOrgRequest{
		OrgName:        "Someone Else's New Org",
		AdminFirstName: "Attacker",
		AdminEmail:     "existing@example.com",
		AdminPhone:     "9876543210",
		AdminPassword:  "a-guessed-password",
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid email or password")
	// No transaction should ever have started — an unverified password must
	// never get as far as creating an organization.
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestRegisterOrganization_ExistingEmailCorrectPassword_AttachesNewOrgWithoutRecreatingUser(t *testing.T) {
	s, mock := newAuthServiceWithMock(t)
	ctx := context.Background()

	existingUserID := "11111111-1111-1111-1111-111111111111"
	newOrgID := "22222222-2222-2222-2222-222222222222"
	password := "their-real-password"
	existingHash, err := util.HashPassword(password)
	require.NoError(t, err)

	mock.ExpectQuery("GetUserByEmail").WillReturnRows(
		userRow(existingUserID, "existing@example.com", existingHash),
	)
	mock.ExpectQuery("GetUserCredentials").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "password_hash", "updated_at"}).AddRow(existingUserID, existingHash, nil),
	)

	mock.ExpectBegin()
	mock.ExpectQuery("CreateOrganizations").WillReturnRows(
		sqlmock.NewRows([]string{"id", "name", "domain", "attendance_enabled", "created_at"}).
			AddRow(newOrgID, "Second Org", nil, false, nil),
	)
	// Deliberately no expectation for CreateUser/CreateUserCredentials — the
	// existing identity must be reused, not recreated, for this branch.
	mock.ExpectQuery("CreateOrgMembership").WillReturnRows(
		sqlmock.NewRows([]string{"id", "user_id", "org_id", "status", "created_at"}).
			AddRow("33333333-3333-3333-3333-333333333333", existingUserID, newOrgID, "ACTIVE", nil),
	)
	mock.ExpectQuery("AddUserSystemRole").WillReturnRows(
		sqlmock.NewRows([]string{"user_id", "org_id", "role", "granted_at"}).
			AddRow(existingUserID, newOrgID, "SUPER_ADMIN", nil),
	)
	mock.ExpectCommit()

	err = s.RegisterOrganization(ctx, schemas.RegisterOrgRequest{
		OrgName:        "Second Org",
		AdminFirstName: "Ignored",
		AdminEmail:     "existing@example.com",
		AdminPhone:     "9876543210",
		AdminPassword:  password,
	})

	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}
