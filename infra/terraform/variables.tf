variable "gcp_project_id" {
  type        = string
  description = "GCP Project ID"
  default     = "fun-chess-506800"
}

variable "gcp_region" {
  type        = string
  description = "GCP Region for Cloud Run"
  default     = "asia-southeast1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name"
  default     = "fun-chess"
}

variable "container_image" {
  type        = string
  description = "Container image URI"
  default     = "gcr.io/fun-chess-506800/fun-chess:latest"
}

variable "min_instances" {
  type        = number
  description = "Minimum number of Cloud Run instances (scale-to-zero)"
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum number of Cloud Run instances"
  default     = 10
}

variable "cpu_limit" {
  type        = string
  description = "CPU limit for container"
  default     = "1"
}

variable "memory_limit" {
  type        = string
  description = "Memory limit for container"
  default     = "512Mi"
}
