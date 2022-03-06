#!/usr/bin/env bash

set -e
cd `dirname "$0"`
cd ..

rm -rf target
./node_modules/.bin/imploder --tsconfig tsconfig.json --profile release