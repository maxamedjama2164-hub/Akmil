from app.services.normalizer import normalize


def test_empty_input_returns_empty_list():
    assert normalize("") == []
    assert normalize("   ") == []


def test_strips_tashkeel():
    # full Bismillah with diacritics → plain rasm
    src = "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ"
    assert normalize(src) == ["بسم", "الله", "الرحمن", "الرحيم"]


def test_collapses_hamza_variants():
    assert normalize("أحمد إيمان آمن ٱلله") == ["احمد", "ايمان", "امن", "الله"]


def test_collapses_alif_maqsura_to_ya():
    assert normalize("على هدى") == ["علي", "هدي"]


def test_collapses_ta_marbuta_to_ha():
    assert normalize("جنة رحمة") == ["جنه", "رحمه"]


def test_strips_tatweel():
    # تـــــم contains tatweel (U+0640) between letters
    assert normalize("تــــم") == ["تم"]


def test_drops_non_arabic_chars():
    # Latin, digits, English punctuation, and Arabic punctuation are all dropped
    assert normalize("بسم 1الله, hello!") == ["بسم", "الله"]


def test_collapses_whitespace():
    assert normalize("بسم   الله\nالرحمن\tالرحيم") == [
        "بسم",
        "الله",
        "الرحمن",
        "الرحيم",
    ]


def test_idempotent_on_already_normalized_text():
    once = normalize("بسم الله الرحمن الرحيم")
    twice = normalize(" ".join(once))
    assert once == twice


def test_handles_ayah_2_142_real_text():
    # Surah 2, ayah 142 (Juz' 2 boundary) — exercise hamza + alif maqsura
    src = "سَيَقُولُ السُّفَهَاءُ مِنَ النَّاسِ مَا وَلَّاهُمْ عَنْ قِبْلَتِهِمُ الَّتِي كَانُوا عَلَيْهَا"
    tokens = normalize(src)
    assert tokens[0] == "سيقول"
    assert "السفهاء" in tokens
    assert "عليها" in tokens
