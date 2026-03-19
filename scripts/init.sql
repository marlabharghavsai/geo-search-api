CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    price INTEGER NOT NULL,
    date_of_transfer DATE NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    views INTEGER DEFAULT 0
);

CREATE INDEX idx_location ON properties USING GIST(location);
