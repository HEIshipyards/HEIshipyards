import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sync_v2", ROOT / "scripts/sync_workshop_v2.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SyncTests(unittest.TestCase):
    def setUp(self):
        self.config = {"id": "3718140217", "route": "ship-excalibur", "category": "Combat"}
        self.prior = {"title": "Excalibur", "preview_url": "https://images.steamusercontent.com/x",
                      "gallery_urls": ["https://images.steamusercontent.com/old"],
                      "images": {}}
    def test_stale_gallery_is_retained_and_labeled(self):
        result = mod.build_listing(self.config, self.prior, {}, {"result":1, "title":"New Excalibur",
                         "preview_url":"https://images.steamusercontent.com/new", "previews":[]}, {}, "", False)
        self.assertEqual(result["gallery_source"], "saved")
        self.assertEqual(result["gallery_urls"], self.prior["gallery_urls"])
        self.assertEqual(result["title"], "New Excalibur")
    def test_fresh_smaller_gallery_is_accepted(self):
        result = mod.build_listing(self.config, self.prior, {}, {"result":1, "previews":[
            {"url":"https://images.steamusercontent.com/newphoto"}]}, {}, "", False)
        self.assertEqual(result["gallery_source"], "steam-api")
        self.assertEqual(result["gallery_urls"], ["https://images.steamusercontent.com/newphoto"])
    def test_override_is_authoritative(self):
        result = mod.build_listing(self.config, self.prior, {}, None,
            {"images":["https://images.steamusercontent.com/manual"]}, "", False)
        self.assertEqual(result["gallery_source"], "manual")
        self.assertEqual(result["gallery_urls"], ["https://images.steamusercontent.com/manual"])
    def test_deny_unapproved_image_hosts(self):
        self.assertIsNone(mod.valid_url("https://example.com/image.png"))
        self.assertIsNone(mod.valid_url("http://images.steamusercontent.com/file"))
        self.assertIsNone(mod.valid_url("https://images.steamusercontent.com.evil.org/file"))
    def test_cache_does_not_download_without_explicit_flag(self):
        with patch.object(mod, "cache_image", side_effect=AssertionError("Unexpected download")):
            mod.build_listing(self.config, self.prior, {}, None, {}, "", False)
    def test_offline_seed_preserves_canonical_route(self):
        result = mod.build_listing(self.config, {}, self.prior, None, {}, "", False)
        self.assertEqual(result["route"], "ship-excalibur")
        self.assertEqual(result["metadata_status"], "preserved")

if __name__ == "__main__":
    unittest.main()
