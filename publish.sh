#!/bin/sh
# Publica la versión web en GitHub Pages (rama gh-pages) a partir de www/.
set -e
cd "$(dirname "$0")"
node build.js
cd www
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c core.autocrlf=false commit -q -m "Publicar app"
git push -q -f https://github.com/nickbarrios17/gym-app.git gh-pages
rm -rf .git
echo "Publicado: https://nickbarrios17.github.io/gym-app/"
