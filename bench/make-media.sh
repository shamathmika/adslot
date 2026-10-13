#!/bin/sh
# Generates the synthetic creative: 15s HLS ladder (3 renditions), posters, captions.
# Output goes to media/ (gitignored); CI regenerates it.
set -e
OUT=media/creative
rm -rf "$OUT" && mkdir -p "$OUT"
SRC="-f lavfi -i testsrc2=size=1280x720:rate=30:duration=15 -f lavfi -i sine=frequency=440:duration=15"

for r in "240 426 300k" "480 854 900k" "720 1280 2200k"; do
  set -- $r
  mkdir -p "$OUT/$1p"
  ffmpeg -loglevel error -y $SRC -vf scale=$2:$1 -c:v libx264 -profile:v main -preset veryfast \
    -b:v $3 -maxrate $3 -bufsize $3 -g 60 -keyint_min 60 -sc_threshold 0 \
    -c:a aac -b:a 64k -ac 2 \
    -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename "$OUT/$1p/seg%02d.ts" "$OUT/$1p/index.m3u8"
done

cat > "$OUT/master.m3u8" <<M3U
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240,CODECS="avc1.4d401e,mp4a.40.2"
240p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480,CODECS="avc1.4d401f,mp4a.40.2"
480p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/index.m3u8
M3U

ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=1 -frames:v 1 -q:v 2 "$OUT/poster.jpg"
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=1 -frames:v 1 -vf scale=320:180 -q:v 8 "$OUT/poster-lo.jpg"

cat > "$OUT/captions.vtt" <<VTT
WEBVTT

00:00.000 --> 00:04.000 line:75%
Meet the Trailblaze Runner X.

00:04.000 --> 00:09.000 line:75%
Lighter foam. Grippier outsole. Same price.

00:09.000 --> 00:15.000 line:75%
Tap Shop now to see colours and sizes.
VTT

cat > "$OUT/creative.json" <<JSON
{
  "id": "trailblaze-x-15s",
  "advertiser": "Trailblaze",
  "headline": "Trailblaze Runner X",
  "body": "Lighter foam, grippier outsole. Built for long miles.",
  "cta": "Shop now",
  "clickUrl": "https://example.com/trailblaze-runner-x",
  "hls": "master.m3u8",
  "poster": "poster.jpg",
  "posterLo": "poster-lo.jpg",
  "captions": "captions.vtt",
  "durationSec": 15
}
JSON
du -sh "$OUT"; ls -la "$OUT"

# Host page imagery (the page we are a guest on).
H=media/host
rm -rf "$H" && mkdir -p "$H"
ffmpeg -loglevel error -y -f lavfi -i mandelbrot=size=1200x900:rate=1 -frames:v 1 -q:v 3 "$H/hero.jpg"
for i in 1 2 3 4 5; do
  ffmpeg -loglevel error -y -f lavfi -i "mandelbrot=size=600x450:rate=1:start_scale=0.$((i+1))" -frames:v 1 -q:v 4 "$H/gallery$i.jpg"
done
for i in 1 2 3 4 5 6 7 8; do
  ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=400x400:rate=1" -vf "hue=h=$((i*45))" -frames:v 1 -q:v 5 "$H/related$i.jpg"
done
du -sh "$H"
