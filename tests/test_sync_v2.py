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
    def test_thumbnail_resize_query_removed(self):
        url = "https://images.steamusercontent.com/ugc/123/ABC/?imw=116&imh=65&ima=fit&letterbox=true"
        self.assertEqual(mod.full_resolution_url(url), "https://images.steamusercontent.com/ugc/123/ABC/")
        self.assertEqual(mod.unique_images([url, url.replace("116", "268")]), ["https://images.steamusercontent.com/ugc/123/ABC/"])

    def test_steam_page_only_stills(self):
        import io
        from unittest.mock import patch
        html = b"""var rgFullScreenshotURLs = [
         { 'previewid': '1', 'url': 'https://images.steamusercontent.com/ugc/111/AAA/?imw=5000' },
         { 'previewid': '2', 'url': 'https://images.steamusercontent.com/ugc/222/BBB/?imw=5000' },
        ]; var rgMovieFlashvars = {'url': 'https://images.steamusercontent.com/ugc/333/VIDEO/'};"""
        class FakeResponse(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): self.close()
        with patch.object(mod.urllib.request, "urlopen", return_value=FakeResponse(html)):
            result = mod.fetch_page_gallery("3718140217", None)
        self.assertEqual(result, ["https://images.steamusercontent.com/ugc/111/AAA/",
                                  "https://images.steamusercontent.com/ugc/222/BBB/"])

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
