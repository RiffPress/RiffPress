#!/usr/bin/env bash
# Runs on the demo host after each deploy (the WP Engine deploy action's SCRIPT), and every night:
# the plugin is active, permalinks are pretty, and the site is reset to the seed.
set -euo pipefail
ROOT=$(dirname "$(find ~/sites -maxdepth 2 -name wp-config.php | head -1)")
cd "$ROOT"
wp plugin activate riff --quiet || true
wp rewrite structure '/%postname%/' --hard --quiet
wp eval-file wp-content/riff-demo/demo-reset.php
wp cache flush --quiet || true
