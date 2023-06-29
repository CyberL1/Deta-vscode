#!/bin/bash

get_latest_release() {
    curl --silent "https://api.github.com/repos/microsoft/vscode/releases/latest" |
    grep '"tag_name":' |
    sed -E 's/.*"([^"]+)".*/\1/'
}

VSCODE_REPO="https://github.com/microsoft/vscode"
VSCODE_VERSION="$(get_latest_release)"

if [ -z $DETA_SPACE ]; then
  if [ -d dist ]; then
    echo Previous build found, removing...
    rm -rf dist
  else
    echo This is a new build, skipping...
  fi

  if [ -d vscode ]; then
    echo vscode source code found, do you want to reclone?
    select yn in "Yes" "No"; do
      case $yn in
        Yes) rm -rfv vscode; git clone $VSCODE_REPO -b $VSCODE_VERSION;;
        No) break;;
      esac
    done
  else
    echo vscode source code not found, cloning...
    git clone $VSCODE_REPO -b $VSCODE_VERSION
  fi

  cd vscode

  echo Replacing workbench file...
  cp -r ../workbench.ts src/vs/code/browser/workbench/workbench.ts

  echo Installing dependencies...
  yarn

  echo Compiling vscode...
  yarn gulp vscode-web-min

  cd ..

  echo Copying vscode-web to dist...
  mv vscode-web dist

  echo Splitting workbech file into smaller parts...
  split -b 4MB -d dist/out/vs/workbench/workbench.web.main.js dist/out/vs/workbench/workbench.web.main.js.part
fi

if [ -d extensions ]; then
  echo Extensions directory found, compiling all extensions...
  cd extensions

  find * -prune -type d -exec bash -c ' \
    echo Compiling {}...
    cd {}
    yarn
    yarn run compile-web
    cd ..
  ' \;
  else
    echo Extensions directory not found, skipping...
fi

if [ $DETA_SPACE ]; then
  echo Cleaning...
  rm -rf extensions
fi
