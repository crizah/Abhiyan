# ── Route 53 Hosted Zone ─────────────────────────────────────────────────────

data "aws_route53_zone" "main" {
  name         = var.domain
  private_zone = false
}

# ── ACM Certificate ───────────────────────────────────────────────────────────
# API Gateway custom domains require the cert to be in us-east-1 regardless of
# where the rest of your infra lives.

resource "aws_acm_certificate" "api" {
  provider          = aws.us_east_1
  domain_name       = "api.${var.domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "api.${var.domain}" }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "api" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ── API Gateway Custom Domain ─────────────────────────────────────────────────

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = "api.${var.domain}"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = var.api_gateway_id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = "$default"
}

# ── Route 53 Record → API Gateway ────────────────────────────────────────────

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
