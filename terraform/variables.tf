variable "project" {
  type    = string
  default = "abhiyan"
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "domain" {
  type        = string
  description = "Root domain e.g. yourdomain.com"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Master password for RDS. Store in terraform.tfvars (gitignored)."
}

variable "s3_bucket_name" {
  type        = string
  description = "Name of the existing S3 bucket for file uploads and face photos."
}

variable "lambda_deployment_bucket" {
  type        = string
  description = "S3 bucket where CI uploads Lambda zip artifacts."
}

variable "github_repo" {
  type        = string
  description = "GitHub repo in owner/repo format e.g. crizah/Abhiyan"
}

variable "frontend_url" {
  type        = string
  description = "Frontend origin URL e.g. https://app.yourdomain.com"
}

variable "aws_ses_sender" {
  type        = string
  description = "Verified SES sender email"
}

variable "phone_id" {
  type        = string
  description = "WhatsApp Business phone ID"
}

variable "cookie_domain" {
  type        = string
  description = "Cookie domain e.g. yourdomain.com"
}
