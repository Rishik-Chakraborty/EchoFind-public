import os
import unittest
import requests

class TestEchoFind(unittest.TestCase):
    BASE_URL = "http://127.0.0.1:8000"

    def test_health(self):
        """Test health check endpoint."""
        try:
            response = requests.get(f"{self.BASE_URL}/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})
        except requests.exceptions.ConnectionError:
            self.skipTest(f"FastAPI server is not running on {self.BASE_URL}. Start the server before running integration tests.")

    def test_corpus_map(self):
        """Test the PCA/KMeans corpus clustering endpoint."""
        try:
            response = requests.get(f"{self.BASE_URL}/api/v1/corpus/map")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIsInstance(data, list)
            if len(data) > 0:
                item = data[0]
                self.assertIn("id", item)
                self.assertIn("x", item)
                self.assertIn("y", item)
                self.assertIn("z", item)
                self.assertIn("cluster", item)
                self.assertIn("is_outlier", item)
        except requests.exceptions.ConnectionError:
            self.skipTest(f"FastAPI server is not running on {self.BASE_URL}.")

    def test_search_endpoint(self):
        """Test search endpoint with a standard query."""
        try:
            response = requests.post(f"{self.BASE_URL}/api/v1/search", json={"text": "dog barking"})
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIsInstance(data, list)
            if len(data) > 0:
                item = data[0]
                self.assertIn("file_id", item)
                self.assertIn("filename", item)
                self.assertIn("start_time", item)
                self.assertIn("end_time", item)
                self.assertIn("score", item)
        except requests.exceptions.ConnectionError:
            self.skipTest(f"FastAPI server is not running on {self.BASE_URL}.")

if __name__ == "__main__":
    unittest.main()
