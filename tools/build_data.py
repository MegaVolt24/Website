#!/usr/bin/env python3
"""Собирает data/products.js для сайта МегаВольт24 из catalog_products_priced.jsonl."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path("/home/kitty/Documents/Parse/catalog_products_priced.jsonl")
OUTPUT = ROOT / "data" / "products.js"
MAX_IMAGES = 8
PRICE_FACTOR = 0.7


def clean(value):
    if value is None:
        return ""
    return " ".join(str(value).split())


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Не найден файл каталога: {source}")

    products = []
    seen = set()

    with source.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)

            sku = clean(row.get("sku"))
            title = clean(row.get("title"))
            if not title:
                continue

            key = (sku, title)
            if key in seen:
                continue
            seen.add(key)

            path = [clean(p) for p in (row.get("category_path") or []) if clean(p)]
            category = path[1] if len(path) > 1 else "Прочий инструмент"
            subcategory = path[2] if len(path) > 2 else ""

            images = []
            for url in row.get("images") or []:
                url = clean(url)
                if url and url not in images:
                    images.append(url)
                if len(images) >= MAX_IMAGES:
                    break

            specs = {}
            for name, value in (row.get("specs") or {}).items():
                name, value = clean(name), clean(value)
                if name and value:
                    specs[name] = value

            price = row.get("price")
            try:
                price = float(price)
            except (TypeError, ValueError):
                continue

            products.append(
                {
                    "id": clean(row.get("product_id")) or sku or str(len(products)),
                    "sku": sku,
                    "title": title,
                    "price": round(price * PRICE_FACTOR),
                    "oldPrice": None,
                    "availability": clean(row.get("availability")) or "Уточняйте",
                    "brand": clean(row.get("brand")) or "Без бренда",
                    "category": category,
                    "subcategory": subcategory,
                    "images": images,
                    "specs": specs,
                    "description": clean(row.get("description")),
                }
            )

    products.sort(key=lambda item: (item["category"], item["subcategory"], item["brand"], item["title"]))

    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(products),
        "products": products,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as fh:
        fh.write("window.MEGAVOLT_DATA=")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"Готово: {len(products)} товаров -> {OUTPUT} ({size_mb:.1f} МБ)")


if __name__ == "__main__":
    main()
