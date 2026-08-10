from pathlib import Path
import re
INDEX = Path("public/index.html")
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
text, n = re.subn(r"styles\.css\?v=[^\"']+", "styles.css?v=marquee-dotted-1", text, count=1)
print("styles", n)
# keep marquee js version note if we only touch css
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
print("rocket", "\U0001F680".encode() in INDEX.read_bytes())
