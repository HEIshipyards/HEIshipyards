# HEI Steam Workshop integration — prepared, NOT deployed

This is based on the uploaded single-file HEI Shipyards website. Your original lore/specifications, fleet page design and the static images remain as fallbacks.

## Included
- Seven Workshop IDs extracted from the live site's existing ship-detail data.
- `data/workshop.json` starts empty; the webpage still shows its original registry.
- GitHub Actions fetches titles, preview images and timestamps every six hours and commits only changed data.
- Existing ship cards keep their handwritten titles and text; their preview images may update from Steam data.
- New item IDs manually added to `data/workshop-ids.json` appear as external Steam Workshop cards, leaving original ship detail pages untouched.
- Failed Steam calls preserve the previous JSON; `(discontinued)` items are excluded from the synced additions, but existing manually authored cards stay present until explicitly revised.

## Important limitations
- New-item **discovery is NOT automatic**. The official Workshop QueryFiles API needs further verified author identification/API access. Add IDs manually for now.
- Excalibur's previously supplied Workshop ID is an earlier R-1.0 release, so it was not mapped to the existing R-2.0 ship page.
- No site changes have been pushed to GitHub or deployed to Cloudflare.
- Verify this branch on a preview deployment before merging into main.
- The GitHub Actions workflow requires write permissions to commit data.
- Scheduled GitHub Action runs are best-effort and may be delayed.
