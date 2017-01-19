#!/bin/bash

# Creates directories for scripts, views and styles in public
mkdir -p ./public/scripts ./public/views ./public/styles

# Creates directory for sounds
mkdir -p ./public/sounds

# Creates directory for images
mkdir -p ./public/images

# Copies required JS files to public, such as socket.io
cp -r ./private/required/* ./public/scripts/

# Transpiles code to es5 and outputs it to public
./node_modules/browserify/bin/cmd.js private/scripts/* -t [ babelify --presets [ es2015 ] --compact='false' ] -o ./public/scripts/bundle.js

# Minifies transpiled code and outputs it to public
./node_modules/uglify-js/bin/uglifyjs --compress --mangle --output ./public/scripts/bundle.min.js -- ./public/scripts/bundle.js

# Compiles and compresses sass to css and moves them to public
for file in ./private/styles/*
do
  ./node_modules/node-sass/bin/node-sass --output-style=compressed "$file" -o ./public/styles
done

# Compresses HTML files and moves them to public
for file in ./private/views/*
do
  ./node_modules/html-minifier/cli.js --remove-comments --collapse-whitespace "$file" -o ./public/views/$(basename "$file")
done

configSize=${#CONFIGPATH}

# Installs config from external source, if CONFIGPATH is set
if (($configSize > 0)); then
  # Installs wget, if it doesn't exist
  if ! type "wget" > /dev/null; then
    apt-get update && apt-get -y install wget && rm -rf /var/lib/apt/lists/*
  fi

  mkdir ./config/modified
  wget $CONFIGPATH/appConfig.js -O ./config/modified/appConfig.js
  wget $CONFIGPATH/databasePopulation.js -O ./config/modified/databasePopulation.js
fi

npm start
