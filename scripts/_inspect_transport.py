from pathlib import Path
t = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html").read_text(encoding="utf-8")
i = t.find("nodeTransportGroup")
print(t[i:i + 2800])
print("---")
print("mojibake", "ðŸ" in t or "â€" in t or "Â·" in t)
print("rocket", "\U0001F680" in t)
print("replacement", t.count("\ufffd"), t.count("????"))
# bottom bar area around transport
for key in ["nodeTransportPrev", "nodeTransportStop", "nodeTransportPlay", "nodeTransportRecord", "nodeTransportNext", "debug", "Donate"]:
    j = t.find(key)
    if j >= 0:
        snip = t[j:j + 220].replace("\n", " ")
        print(key, ":", snip[:200])
