-- Seed initial forum data for testing

-- Insert starter forums if none exist
INSERT INTO forums (name, description, category, is_active, sort_order)
VALUES
  ('General Discussion', 'General topics related to learning and education', 'General', true, 1),
  ('Mathematics', 'Discussions about math concepts, problems, and learning strategies', 'Academic', true, 2),
  ('Computer Science', 'Programming, algorithms, and computer science theory', 'Academic', true, 3),
  ('Language Arts', 'Reading, writing, and literary discussions', 'Academic', true, 4),
  ('Study Tips & Resources', 'Share study strategies and helpful resources', 'Resources', true, 5)
ON CONFLICT (id) DO NOTHING;
