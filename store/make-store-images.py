"""Makes the App Store and Google Play images from the CI screenshots.

Each store screenshot is a phone screen on the brand gradient with a short headline,
the way most store pages look. Run from the repo root after fetching the screenshot
branches (they are written by .github/workflows/ios.yml and app.yml):

    git fetch origin ios-native-screenshots app-screenshots
    python3 store/make-store-images.py out/

Needs Pillow and the Inter font (fonts.google.com/specimen/Inter, free).
"""
import io
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

PINK, VIOLET, NIGHT = (255, 61, 127), (139, 92, 246), (14, 11, 22)

# (headline, iPhone screenshot, Android screenshot), in store order.
SCREENS = [
    ("See what's on\ntonight", "44-feed-dark.png", "24-feed-dark.png"),
    ("Find parties\nnear you", "52-nearby_map-dark.png", "26-nearby-dark.png"),
    ("RSVP in\none tap", "53-event-dark.png", "27-event-dark.png"),
    ("Plan the night\nwith friends", "61-party_chat-dark.png", "10-chat.png"),
    ("Share the\nmoments", "48-me-dark.png", "29-profile-dark.png"),
]

FONT_PATHS = ["/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf", "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
              "Inter-ExtraBold.otf", "Inter-Bold.otf"]


def font(size):
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    sys.exit("Inter font not found: install it or put Inter-Bold.otf next to this script")


def from_branch(branch, name):
    data = subprocess.run(["git", "show", f"origin/{branch}:{name}"], check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert("RGB")


def gradient(size):
    """Pink at the top left to violet at the bottom right, darkening towards the bottom."""
    w, h = size
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            c = [PINK[i] * (1 - t) + VIOLET[i] * t for i in range(3)]
            dark = max(0, (y - 20) / 44) * 0.75
            px[x, y] = tuple(int(c[i] * (1 - dark) + NIGHT[i] * dark) for i in range(3))
    return small.resize(size, Image.BICUBIC)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), radius, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), mask)
    return out


def store_shot(headline, screen, size):
    w, h = size
    canvas = gradient(size).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    title = font(int(w * 0.085))
    top = int(h * 0.06)
    draw.multiline_text((w / 2, top), headline, font=title, fill="white", anchor="ma", align="center", spacing=int(w * 0.02))
    text_bottom = draw.multiline_textbbox((w / 2, top), headline, font=title, anchor="ma", spacing=int(w * 0.02))[3]

    # The phone screen fills the rest, running off the bottom edge like a phone held up.
    phone_w = int(w * 0.80)
    phone = screen.resize((phone_w, int(screen.height * phone_w / screen.width)), Image.LANCZOS)
    phone = rounded(phone, int(phone_w * 0.09))
    y = text_bottom + int(h * 0.045)
    x = (w - phone_w) // 2
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 20, x + phone_w, y + phone.height + 20), int(phone_w * 0.09), fill=(0, 0, 0, 140))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(40)))
    border = int(w * 0.012)
    ImageDraw.Draw(canvas).rounded_rectangle((x - border, y - border, x + phone_w + border, y + phone.height + border),
                                             int(phone_w * 0.09) + border, fill=(255, 255, 255, 60))
    canvas.alpha_composite(phone, (x, y))
    return canvas.convert("RGB")


def feature_graphic(icon):
    """Google Play's 1024 x 500 banner: icon and name on the gradient."""
    canvas = gradient((1024, 500)).convert("RGBA")
    icon = rounded(icon.resize((220, 220), Image.LANCZOS), 50)
    canvas.alpha_composite(icon, (90, 140))
    draw = ImageDraw.Draw(canvas)
    draw.text((350, 175), "PartyNearMe", font=font(82), fill="white")
    draw.text((354, 280), "Find the party. Share the night.", font=font(36), fill=(255, 255, 255, 230))
    return canvas.convert("RGB")


def main(out):
    out = Path(out)
    (out / "app-store").mkdir(parents=True, exist_ok=True)
    (out / "google-play").mkdir(parents=True, exist_ok=True)
    for i, (headline, ios_name, android_name) in enumerate(SCREENS, 1):
        slug = headline.split("\n")[0].lower().replace(" ", "-").replace("'", "")
        # 6.9-inch iPhone size, which App Store Connect scales down for smaller iPhones.
        store_shot(headline, from_branch("ios-native-screenshots", ios_name), (1320, 2868)).save(
            out / "app-store" / f"{i}-{slug}.png")
        # 9:16, which Play shows without cropping.
        store_shot(headline, from_branch("app-screenshots", android_name), (1080, 1920)).save(
            out / "google-play" / f"{i}-{slug}.png")
    icon = Image.open("ios/PartyNearMe/Assets.xcassets/AppIcon.appiconset/icon-1024.png").convert("RGB")
    icon.resize((512, 512), Image.LANCZOS).save(out / "google-play" / "icon-512.png")
    feature_graphic(icon).save(out / "google-play" / "feature-graphic.png")
    print(f"Wrote images to {out}/app-store and {out}/google-play")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "store-images")
