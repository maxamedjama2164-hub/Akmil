import pytest

from app.services.normalizer import normalize
from app.services.quran_service import QuranService


@pytest.fixture(scope="module")
def quran() -> QuranService:
    return QuranService()


def test_lists_all_114_surahs(quran):
    surahs = quran.list_surahs()
    assert len(surahs) == 114
    assert surahs[0].name_en == "Al-Fatihah"
    assert surahs[-1].name_en == "An-Nas"


def test_fatiha_has_seven_ayat(quran):
    ayat = quran.list_ayat(1)
    assert len(ayat) == 7
    assert ayat[0].number == 1


def test_juz_filter_returns_subset(quran):
    # Baqarah spans juz 1..3. Restricting to juz 2..2 should be a strict subset.
    all_baqarah = quran.list_ayat(2)
    juz2_only = quran.list_ayat(2, juz_min=2, juz_max=2)
    assert len(juz2_only) < len(all_baqarah)
    assert all(a.juz == 2 for a in juz2_only)


def test_build_target_basic(quran):
    # Pick Fatiha 1:1 → target should start at 1:2
    target = quran.build_target(surah=1, start_ayah=1)
    assert len(target.ayat) >= 1
    assert target.ayat[0].surah == 1
    assert target.ayat[0].number == 2
    # 1:2 is "الحمد لله رب العالمين"
    tokens = normalize(target.text_simple)
    assert tokens[0] == "الحمد"


def test_build_target_crosses_surah_boundary(quran):
    # Pick the last ayah of Al-Fatihah (1:7) — target should jump to 2:1
    target = quran.build_target(surah=1, start_ayah=7)
    assert target.ayat[0].surah == 2
    assert target.ayat[0].number == 1


def test_build_target_caps_at_max_words_for_long_ayah(quran):
    # Baqarah 282 is the longest ayah in the Quran (~129 words).
    # Picking 2:281 should give us 2:282 alone (caps at max_words=25).
    target = quran.build_target(surah=2, start_ayah=281)
    assert len(target.ayat) == 1
    assert target.ayat[0].number == 282


def test_build_target_at_end_of_quran_returns_empty(quran):
    # Picking the literal last ayah (114:6) leaves nothing to continue.
    target = quran.build_target(surah=114, start_ayah=6)
    assert target.ayat == ()
    assert target.text_simple == ""


def test_build_target_caps_at_2_ayat_for_short_ayat(quran):
    # Surah An-Nas ayat are very short — should still cap at 2.
    target = quran.build_target(surah=114, start_ayah=1)
    assert len(target.ayat) == 2
    assert [a.number for a in target.ayat] == [2, 3]


def test_get_ayah_unknown_returns_none(quran):
    assert quran.get_ayah(1, 999) is None
    assert quran.get_ayah(99, 1) is not None  # surah 99 exists (Al-Zalzalah)
    assert quran.get_ayah(115, 1) is None  # past last surah
