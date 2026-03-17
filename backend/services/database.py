"""
Database Service.
Manages connection to PostgreSQL for persisting fact-checking results.
"""
import os
import logging
import json
import psycopg2
from typing import Optional

class DatabaseService:
    """
    Handles persistence of analysis results to a PostgreSQL database.
    Includes a safety check for configuration and provides fallback if disabled.
    """
    def __init__(self):
        self.host = os.getenv("DB_HOST")
        self.user = os.getenv("DB_USER")
        self.password = os.getenv("DB_PASS")
        self.dbname = os.getenv("DB_NAME", "fact-checking-db")
        self.enabled = all([self.host, self.user, self.password])
        
        if not self.enabled:
            logging.warning("Database configuration missing. Result persistence is disabled.")
        else:
            self._ensure_schema()

    def _ensure_schema(self):
        """Creates the necessary database tables if they do not exist."""
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS fact_checks (
                    id SERIAL PRIMARY KEY,
                    url TEXT NOT NULL,
                    results JSONB NOT NULL,
                    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            logging.error(f"Failed to ensure schema: {e}")
            self.enabled = False

    def _get_connection(self):
        return psycopg2.connect(
            host=self.host,
            user=self.user,
            password=self.password,
            dbname=self.dbname
        )

    def log_result(self, url: str, results: dict):
        """
        Logs the fact-checking results for a specific URL to the database.
        
        Args:
            url (str): The URL analyzed.
            results (dict): The complete analysis payload.
        """
        if not self.enabled:
            return
        
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO fact_checks (url, results) VALUES (%s, %s)",
                (url, json.dumps(results))
            )
            conn.commit()
            cur.close()
            conn.close()
            logging.info(f"Result successfully logged to DB for {url}")
        except Exception as e:
            logging.error(f"Failed to log to database: {e}")
