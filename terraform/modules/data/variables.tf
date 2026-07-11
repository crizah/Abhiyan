variable "project" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "rds_sg_id" {
  type = string
}

variable "redis_sg_id" {
  type = string
}

variable "db_name" {
  type    = string
  default = "abhiyan"
}

variable "db_username" {
  type    = string
  default = "abhiyan"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "frontend_url" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "aws_ses_sender" {
  type        = string
  description = "Verified SES sender email address"
}

variable "phone_id" {
  type        = string
  description = "WhatsApp Business phone ID"
}

variable "cookie_domain" {
  type        = string
  description = "Domain for cookies e.g. yourdomain.com"
}

variable "google_client_id"{
  type = string
  description = "google client id for oauth"
}
