#!/bin/bash

find * -prune -type d -exec bash -c ' \
  shopt -s extglob
  echo Compiling {}...
  cd {}
  yarn
  yarn run compile-web
  [ $DETA_SPACE ] && rm -rf !(package.json|dist)
  cd ..
' \;

[ $DETA_SPACE ] && rm build.sh
