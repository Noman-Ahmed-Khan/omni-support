-- The "searchVector" columns existed but were never populated, so full-text search
-- always returned nothing. Triggers now keep them current and GIN indexes make them fast.
-- Text configurations: 'english' for ticket/comment prose, 'simple' for names and emails.

CREATE OR REPLACE FUNCTION tickets_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english', coalesce(NEW."title", '') || ' ' || coalesce(NEW."description", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ticket_comments_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english', coalesce(NEW."content", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION customers_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple', coalesce(NEW."fullName", '') || ' ' || coalesce(NEW."email", '') || ' ' || coalesce(NEW."company", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_search_vector_trigger ON "tickets";
CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "description" ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION tickets_search_vector_refresh();

DROP TRIGGER IF EXISTS ticket_comments_search_vector_trigger ON "ticket_comments";
CREATE TRIGGER ticket_comments_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "content" ON "ticket_comments"
  FOR EACH ROW EXECUTE FUNCTION ticket_comments_search_vector_refresh();

DROP TRIGGER IF EXISTS customers_search_vector_trigger ON "customers";
CREATE TRIGGER customers_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "fullName", "email", "company" ON "customers"
  FOR EACH ROW EXECUTE FUNCTION customers_search_vector_refresh();

-- Backfill existing rows (fires the triggers).
UPDATE "tickets" SET "title" = "title";
UPDATE "ticket_comments" SET "content" = "content";
UPDATE "customers" SET "fullName" = "fullName";

-- CreateIndex
CREATE INDEX "customers_search_vector_idx" ON "customers" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "ticket_comments_search_vector_idx" ON "ticket_comments" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "tickets_search_vector_idx" ON "tickets" USING GIN ("searchVector");
