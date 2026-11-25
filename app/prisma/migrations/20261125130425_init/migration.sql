-- CreateEnum
CREATE TYPE "Role" AS ENUM ('citizen', 'clerk', 'admin');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('submitted', 'in_review', 'fulfilled', 'denied');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'citizen',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records_requests" (
    "id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'submitted',
    "requester_id" TEXT NOT NULL,
    "assigned_clerk_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_documents" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "is_released" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_notes" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "records_requests_reference_number_key" ON "records_requests"("reference_number");

-- CreateIndex
CREATE INDEX "records_requests_status_due_at_idx" ON "records_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "records_requests_requester_id_idx" ON "records_requests"("requester_id");

-- CreateIndex
CREATE INDEX "records_requests_assigned_clerk_id_idx" ON "records_requests"("assigned_clerk_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_documents_storage_key_key" ON "request_documents"("storage_key");

-- CreateIndex
CREATE INDEX "request_documents_request_id_idx" ON "request_documents"("request_id");

-- CreateIndex
CREATE INDEX "request_notes_request_id_created_at_idx" ON "request_notes"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_created_at_idx" ON "audit_logs"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "records_requests" ADD CONSTRAINT "records_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records_requests" ADD CONSTRAINT "records_requests_assigned_clerk_id_fkey" FOREIGN KEY ("assigned_clerk_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "records_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "records_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "records_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit log is append-only. Any UPDATE or DELETE is rejected at the database,
-- so even a bug or a compromised app role can't rewrite history.
CREATE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
