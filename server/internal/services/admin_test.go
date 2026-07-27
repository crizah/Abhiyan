package services

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/crizah/Abhiyan/server/internal/schemas"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

// newAdminServiceWithMock wires an AdminService to a sqlmock-backed *sql.DB —
// db.New(mockDB) is the same constructor sqlc-generated Queries always use,
// so every generated query method works against scripted expectations instead
// of a real Postgres connection.
func newAdminServiceWithMock(t *testing.T) (*AdminService, sqlmock.Sqlmock) {
	t.Helper()
	mockDB, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { mockDB.Close() })

	return NewAdminService(mockDB, []byte("test-secret"), nil), mock
}

func TestManageTeamMember_RejectsRequesterOutsideTeamOrg(t *testing.T) {
	s, mock := newAdminServiceWithMock(t)
	ctx := context.Background()

	teamOrgID := "11111111-1111-1111-1111-111111111111"
	mock.ExpectQuery("GetTeamOrgID").WillReturnRows(
		sqlmock.NewRows([]string{"org_id"}).AddRow(teamOrgID),
	)
	// Requester does not belong to the team's org.
	mock.ExpectQuery("CheckUserBelongsToTeamOrg").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(false),
	)

	err := s.ManageTeamMember(ctx,
		"22222222-2222-2222-2222-222222222222", // teamID
		"33333333-3333-3333-3333-333333333333", // userID (target)
		"MEMBER", false,
		"44444444-4444-4444-4444-444444444444", // reqUserID (a different org)
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "you do not belong to this team's organization")
	require.NoError(t, mock.ExpectationsWereMet(), "no query beyond the requester org check should have run")
}

func TestManageTeamMember_RejectsTargetOutsideTeamOrg(t *testing.T) {
	s, mock := newAdminServiceWithMock(t)
	ctx := context.Background()

	teamOrgID := "11111111-1111-1111-1111-111111111111"
	mock.ExpectQuery("GetTeamOrgID").WillReturnRows(
		sqlmock.NewRows([]string{"org_id"}).AddRow(teamOrgID),
	)
	// Requester belongs (e.g. a SUPER_ADMIN of the team's own org)...
	mock.ExpectQuery("CheckUserBelongsToTeamOrg").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(true),
	)
	// ...but the person being added does not — this is the exact bug this
	// session's audit found and closed: a SUPER_ADMIN's own org membership
	// must never be enough to add a foreign-org user to their team.
	mock.ExpectQuery("CheckUserBelongsToTeamOrg").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(false),
	)

	err := s.ManageTeamMember(ctx,
		"22222222-2222-2222-2222-222222222222",
		"33333333-3333-3333-3333-333333333333", // target — different org
		"MEMBER", false,
		"44444444-4444-4444-4444-444444444444",
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "user does not belong to this team's organization")
	require.NoError(t, mock.ExpectationsWereMet(), "no role/membership query should have run once the target's org failed to match")
}

func TestUpdateUserSystemProfile_RejectsCrossOrgUser(t *testing.T) {
	s, mock := newAdminServiceWithMock(t)
	ctx := context.Background()

	mock.ExpectQuery("IsUserInOrg").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(false),
	)

	err := s.UpdateUserSystemProfile(ctx,
		"11111111-1111-1111-1111-111111111111", // target user, different org
		"ADMIN", "ACTIVE",
		"22222222-2222-2222-2222-222222222222", // caller's org
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "unauthorized: user does not belong to your organization")
	require.NoError(t, mock.ExpectationsWereMet(), "status/role should never be mutated for a user outside the caller's org")
}

func TestInviteUser_NewIdentity_CreatesUserThenMembership(t *testing.T) {
	s, mock := newAdminServiceWithMock(t)
	ctx := context.Background()

	newUserID := "33333333-3333-3333-3333-333333333333"

	mock.ExpectBegin()
	mock.ExpectQuery("GetUserByEmail").
		WithArgs("new@example.com").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery("CreateInvitedUser").
		WithArgs("new@example.com").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "org_id", "status", "first_name", "last_name", "email_id", "face_s3_uri", "phone_number", "created_at",
		}).AddRow(newUserID, nil, nil, nil, nil, "new@example.com", nil, nil, nil))
	// Fail here deliberately so the test never needs to reach onionApp.Enqueue
	// (email sending) — everything we care about (which branch fired, with
	// which user id) has already happened by this point.
	mock.ExpectQuery("CreateOrgMembership").
		WillReturnError(errors.New("duplicate key"))
	mock.ExpectRollback()

	_, err := s.InviteUser(ctx, "44444444-4444-4444-4444-444444444444", schemas.InviteUserRequest{
		Email: "New@Example.com", // exercises the lowercasing too
		Role:  "EMPLOYEE",
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "already invited to or a member of this organization")
	require.NoError(t, mock.ExpectationsWereMet(), "CreateInvitedUser must have been called for a brand-new email")
}

func TestInviteUser_ExistingIdentity_SkipsUserCreation(t *testing.T) {
	s, mock := newAdminServiceWithMock(t)
	ctx := context.Background()

	existingUserID := "55555555-5555-5555-5555-555555555555"

	mock.ExpectBegin()
	mock.ExpectQuery("GetUserByEmail").
		WithArgs("existing@example.com").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "org_id", "status", "first_name", "last_name", "email_id", "face_s3_uri", "phone_number", "created_at",
		}).AddRow(existingUserID, nil, nil, nil, nil, "existing@example.com", nil, nil, nil))
	// Note: no expectation for CreateInvitedUser at all — if the service
	// mistakenly created a new identity instead of reusing this one, sqlmock
	// would reject that unexpected call and this test would fail with a
	// different error than the one asserted below.
	mock.ExpectQuery("CreateOrgMembership").
		WillReturnError(errors.New("duplicate key"))
	mock.ExpectRollback()

	_, err := s.InviteUser(ctx, "66666666-6666-6666-6666-666666666666", schemas.InviteUserRequest{
		Email: "existing@example.com",
		Role:  "ADMIN",
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "already invited to or a member of this organization")
	require.NoError(t, mock.ExpectationsWereMet(), "the existing identity must be reused, not recreated")
}
