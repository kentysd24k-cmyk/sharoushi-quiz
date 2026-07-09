import pdfplumber

with pdfplumber.open(r"pdf\R07\57takuitusiki.pdf") as pdf:
    # 3〜4ページ目(問題が始まるあたり)を表示
    for page in pdf.pages[2:4]:
        print(page.extract_text())
        print("=" * 40)