ALTER TABLE sessions ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES profiles(id);
