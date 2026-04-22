"""
Seed 15 MetLife operational staff users (Admin / Manager / Reviewer / Viewer).

Idempotent: skips any user whose email already exists.

Run::

    cd metlife_agents_backend
    uv run python scripts/seed_users.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sqlalchemy import select

from core.v1.services.authentication.authentication import AuthService
from model.database.v1.users import User
from utils.v1.connections import SessionLocal

SEED_USERS = [
    {
        "name": "Takashi Yamamoto",
        "email": "takashi.yamamoto@metlife.co.jp",
        "password": "Admin@1234",
        "role": "Admin",
    },
    {
        "name": "Akiko Suzuki",
        "email": "akiko.suzuki@metlife.co.jp",
        "password": "Admin@1234",
        "role": "Admin",
    },
    {
        "name": "Kenji Nakamura",
        "email": "kenji.nakamura@metlife.co.jp",
        "password": "Admin@1234",
        "role": "Admin",
    },
    {
        "name": "Hiroshi Tanaka",
        "email": "hiroshi.tanaka@metlife.co.jp",
        "password": "Manager@1234",
        "role": "Manager",
    },
    {
        "name": "Yuki Watanabe",
        "email": "yuki.watanabe@metlife.co.jp",
        "password": "Manager@1234",
        "role": "Manager",
    },
    {
        "name": "Satoshi Ito",
        "email": "satoshi.ito@metlife.co.jp",
        "password": "Manager@1234",
        "role": "Manager",
    },
    {
        "name": "Naomi Kobayashi",
        "email": "naomi.kobayashi@metlife.co.jp",
        "password": "Manager@1234",
        "role": "Manager",
    },
    {
        "name": "Emi Sato",
        "email": "emi.sato@metlife.co.jp",
        "password": "Reviewer@1234",
        "role": "Reviewer",
    },
    {
        "name": "Ryo Yamada",
        "email": "ryo.yamada@metlife.co.jp",
        "password": "Reviewer@1234",
        "role": "Reviewer",
    },
    {
        "name": "Mika Hayashi",
        "email": "mika.hayashi@metlife.co.jp",
        "password": "Reviewer@1234",
        "role": "Reviewer",
    },
    {
        "name": "Taro Kimura",
        "email": "taro.kimura@metlife.co.jp",
        "password": "Reviewer@1234",
        "role": "Reviewer",
    },
    {
        "name": "Hana Matsumoto",
        "email": "hana.matsumoto@metlife.co.jp",
        "password": "Viewer@1234",
        "role": "Viewer",
    },
    {
        "name": "Daiki Inoue",
        "email": "daiki.inoue@metlife.co.jp",
        "password": "Viewer@1234",
        "role": "Viewer",
    },
    {
        "name": "Sakura Fujita",
        "email": "sakura.fujita@metlife.co.jp",
        "password": "Viewer@1234",
        "role": "Viewer",
    },
    {
        "name": "Kota Ogawa",
        "email": "kota.ogawa@metlife.co.jp",
        "password": "Viewer@1234",
        "role": "Viewer",
    },
]


async def seed_users() -> None:
    async with SessionLocal() as db:
        created = 0
        skipped = 0

        for data in SEED_USERS:
            stmt = select(User).where(User.email == data["email"])
            result = await db.execute(stmt)
            existing = result.scalars().first()

            if existing:
                print(f"  SKIP  [{existing.role:8}]  {data['email']}")
                skipped += 1
                continue

            user = User(
                name=data["name"],
                email=data["email"],
                password_hash=AuthService.hash_password(data["password"]),
                role=data["role"],
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            print(f"  ADD   [{data['role']:8}]  {data['email']}")
            created += 1

        await db.commit()
        print(f"\nDone — created: {created}  skipped (already exist): {skipped}")


def main() -> None:
    asyncio.run(seed_users())


if __name__ == "__main__":
    main()
