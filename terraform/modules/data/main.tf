# ── RDS PostgreSQL ───────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project}-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier        = "${var.project}-postgres"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp2"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_sg_id]

  # Single-AZ — fine for this scale
  multi_az            = false
  publicly_accessible = false

  # Backups — 7 day retention, runs at low-traffic window
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-final-snapshot"

  tags = { Name = "${var.project}-postgres" }
}

# ── ElastiCache Redis ────────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project}-redis-subnet-group" }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.redis_sg_id]

  tags = { Name = "${var.project}-redis" }
}

# ── SSM Parameters ───────────────────────────────────────────────────────────
# Sensitive values (DB_URL, JWT_SECRET, OPENAI_API_KEY) are created here as
# placeholders. Set the real values manually in the console or via:
#   aws ssm put-parameter --name "/abhiyan/prod/JWT_SECRET" --value "..." --type SecureString --overwrite

resource "aws_ssm_parameter" "db_url" {
  name  = "/${var.project}/prod/DB_URL"
  type  = "SecureString"
  value = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${var.db_name}?sslmode=require"

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "broker_url" {
  name  = "/${var.project}/prod/BROKER_URL"
  type  = "SecureString"
  value = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "dashboard_url" {
  name  = "/${var.project}/prod/DASHBOARD_URL"
  type  = "String"
  value = ":8081"

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "/${var.project}/prod/FRONTEND_URL"
  type  = "String"
  value = var.frontend_url

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "s3_bucket_name" {
  name  = "/${var.project}/prod/AWS_S3_BUCKET_NAME"
  type  = "String"
  value = var.s3_bucket_name

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "ses_sender" {
  name  = "/${var.project}/prod/AWS_SES_SENDER"
  type  = "String"
  value = var.aws_ses_sender

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "phone_id" {
  name  = "/${var.project}/prod/PHONE_ID"
  type  = "String"
  value = var.phone_id

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "cookie_domain" {
  name  = "/${var.project}/prod/COOKIE_DOMAIN"
  type  = "String"
  value = var.cookie_domain

  tags = { Project = var.project }
}

# ── Sensitive placeholders — set real values after apply ─────────────────────
# aws ssm put-parameter --name "/abhiyan/prod/JWT_SECRET" --value "..." --type SecureString --overwrite

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project}/prod/JWT_SECRET"
  type  = "SecureString"
  value = "CHANGE_ME"

  lifecycle { ignore_changes = [value] }

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "openai_api_key" {
  name  = "/${var.project}/prod/OPENAI_API_KEY"
  type  = "SecureString"
  value = "CHANGE_ME"

  lifecycle { ignore_changes = [value] }

  tags = { Project = var.project }
}

resource "aws_ssm_parameter" "whatsapp_access_token" {
  name  = "/${var.project}/prod/WHATSAPP_ACCESS_TOKEN"
  type  = "SecureString"
  value = "CHANGE_ME"

  lifecycle { ignore_changes = [value] }

  tags = { Project = var.project }
}
