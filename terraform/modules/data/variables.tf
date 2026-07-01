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
