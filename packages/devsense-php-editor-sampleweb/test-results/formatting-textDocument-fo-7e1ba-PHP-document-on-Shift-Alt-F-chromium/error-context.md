# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]: DEVSENSE PHP Editor Playground
      - generic [ref=e6]:
        - generic [ref=e7]: "Theme:"
        - combobox [ref=e8] [cursor=pointer]:
          - option "Automatic" [selected]
          - option "Light"
          - option "Dark"
    - main [ref=e9]:
      - code [ref=e11]:
        - generic [ref=e12]:
          - textbox "Editor content" [active]
          - textbox [ref=e13]
          - generic [ref=e15]:
            - generic [ref=e17]: "1"
            - generic [ref=e19]: "2"
            - generic [ref=e21]: "3"
            - generic [ref=e24]: "4"
          - generic [ref=e31]:
            - generic [ref=e33]: <?php
            - generic [ref=e35]: "function foo($x){return strlen($x);}"
            - generic [ref=e37]: "class Bar{public function baz($y){echo $y;}}"
  - generic [ref=e48] [cursor=pointer]:
    - generic [ref=e49]:
      - text: Diagnostics
      - generic [ref=e50]: "0"
    - button "▾" [ref=e51]
  - generic [ref=e52]:
    - alert
    - alert
```