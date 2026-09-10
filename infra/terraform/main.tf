terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Remote GCS Backend Configuration (MIN-001)
  # ---------------------------------------------------------------------------
  # Plaintext local state storage risks secrets leakage (SESSION_SECRET, METRICS_SECRET)
  # and does not provide multi-developer concurrency control.
  # Use Google Cloud Storage (GCS) as a remote backend with state locking and encryption:
  #
  # 1. State Locking:
  #    The Google Cloud Storage backend natively provides state locking via Cloud Storage
  #    object preconditions (generation numbers). No external locking database (e.g. DynamoDB)
  #    is required.
  #
  # 2. Bucket Creation & Security Hardening:
  #    Create a dedicated GCS bucket with Uniform Bucket-Level Access and Public Access Prevention:
  #      gcloud storage buckets create gs://<PROJECT_ID>-tfstate \
  #        --project=<PROJECT_ID> \
  #        --location=<GCP_REGION> \
  #        --uniform-bucket-level-access \
  #        --public-access-prevention
  #
  # 3. Object Versioning (State History & Recovery):
  #    Enable object versioning to protect against accidental state corruption or deletion:
  #      gcloud storage buckets update gs://<PROJECT_ID>-tfstate --versioning
  #
  # 4. Encryption at Rest & CMEK:
  #    By default, Google Cloud encrypts all storage bucket content with Google-managed keys.
  #    For compliance or elevated security with Customer-Managed Encryption Keys (CMEK):
  #      gcloud storage buckets update gs://<PROJECT_ID>-tfstate \
  #        --default-kms-key=projects/<PROJECT_ID>/locations/<GCP_REGION>/keyRings/<RING>/cryptoKeys/<KEY>
  #
  # 5. Migration:
  #    To migrate existing local state (terraform.tfstate) to the remote GCS backend:
  #    Uncomment the backend block below, replace the bucket name, and run:
  #      terraform init -migrate-state
  #
  # backend "gcs" {
  #   bucket = "YOUR_GCS_TFSTATE_BUCKET"  # e.g. "fun-chess-506800-tfstate"
  #   prefix = "fun-chess/state"
  # }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
