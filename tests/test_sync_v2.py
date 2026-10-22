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
        with patch.object(mod, "fetch_page_gallery", side_effect=OSError("Steam HTTP 429")):
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
    def test_excalibur_live_page_gallery_replaces_saved_images(self):
        with patch.object(mod, "fetch_page_gallery",
                          return_value=["https://images.steamusercontent.com/newstill"]):
            result = mod.build_listing(self.config, self.prior, {},
                                       {"result":1, "previews":[]}, {}, "", False)
        self.assertEqual(result["gallery_source"], "steam-page")
        self.assertEqual(result["gallery_urls"], ["https://images.steamusercontent.com/newstill"])

    def test_other_vessel_uses_current_steam_stills(self):
        cfg = {"id": "3821205482", "route": "ship-sojourner", "category": "Civilian"}
        with patch.object(mod, "fetch_page_gallery",
                          return_value=["https://images.steamusercontent.com/sojourner-new"]) as fetch:
            result = mod.build_listing(cfg, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False)
        fetch.assert_called_once_with("3821205482", self.prior["preview_url"])
        self.assertEqual(result["gallery_source"], "steam-page")
        self.assertEqual(result["gallery_urls"],
                         ["https://images.steamusercontent.com/sojourner-new"])

    def test_empty_page_list_replaces_obsolete_gallery(self):
        cfg = {"id": "3695393157", "route": "ship-borehole"}
        with patch.object(mod, "fetch_page_gallery", return_value=[]):
            result = mod.build_listing(cfg, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False)
        self.assertEqual(result["gallery_source"], "steam-page")
        self.assertEqual(result["gallery_urls"], [])

    def test_other_vessel_rate_limited_retains_previous_gallery(self):
        cfg = {"id": "3658866132", "route": "ship-outlander"}
        with patch.object(mod, "fetch_page_gallery",
                          side_effect=mod.urllib.error.HTTPError("url", 429, "Rate limited", {}, None)) as fetch, \
             patch.object(mod.time, "sleep") as sleeper:
            result = mod.build_listing(cfg, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False)
        self.assertEqual(fetch.call_count, 2)
        sleeper.assert_called_once_with(mod.RATE_LIMIT_COOLDOWN_SECONDS)
        self.assertEqual(result["gallery_source"], "saved")
        self.assertTrue(result["gallery_page_rate_limited"])
        self.assertEqual(result["gallery_urls"], self.prior["gallery_urls"])

    def test_request_gap_matches_legacy_interval(self):
        self.assertEqual(mod.PAGE_REQUEST_GAP_SECONDS, 10)

    def test_429_retry_after_cooldown_recovers(self):
        err = mod.urllib.error.HTTPError("url", 429, "Rate limited",
                                          {"Retry-After": "90"}, None)
        with patch.object(mod, "fetch_page_gallery",
                          side_effect=[err, ["https://images.steamusercontent.com/new"]]) as fetch, \
             patch.object(mod.time, "sleep") as sleeper:
            result = mod.build_listing(self.config, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False)
        self.assertEqual(fetch.call_count, 2)
        sleeper.assert_called_once_with(90)
        self.assertEqual(result["gallery_source"], "steam-page")
        self.assertFalse(result["gallery_page_rate_limited"])

    def test_long_retry_after_defers_remaining_gallery_checks(self):
        err = mod.urllib.error.HTTPError("url", 429, "Rate limited",
                                          {"Retry-After": "600"}, None)
        with patch.object(mod, "fetch_page_gallery", side_effect=err) as fetch, \
             patch.object(mod.time, "sleep") as sleeper:
            result = mod.build_listing(self.config, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False)
        fetch.assert_called_once()
        sleeper.assert_not_called()
        self.assertEqual(result["gallery_source"], "saved")
        self.assertTrue(result["gallery_page_rate_limited"])

    def test_manual_gallery_bypasses_steam_page(self):
        cfg = {"id": "3821205482", "route": "ship-sojourner"}
        with patch.object(mod, "fetch_page_gallery",
                          side_effect=AssertionError("Should not access Steam page")):
            result = mod.build_listing(cfg, self.prior, {},
                                       {"result": 1, "previews": []},
                                       {"images": []}, "", False)
        self.assertEqual(result["gallery_source"], "manual")
        self.assertEqual(result["gallery_urls"], [])

    def test_page_lookup_pause_keeps_saved_gallery(self):
        cfg = {"id": "3821205482", "route": "ship-sojourner"}
        with patch.object(mod, "fetch_page_gallery",
                          side_effect=AssertionError("Should not retry when paused")):
            result = mod.build_listing(cfg, self.prior, {},
                                       {"result": 1, "previews": []}, {}, "", False,
                                       allow_page_lookup=False)
        self.assertEqual(result["gallery_source"], "saved")
        self.assertEqual(result["gallery_urls"], self.prior["gallery_urls"])

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
