variable "domain" {
  type        = string
  description = "Root domain e.g. yourdomain.com. Must already be a hosted zone in Route 53."
}

variable "api_gateway_id" {
  type = string
}
