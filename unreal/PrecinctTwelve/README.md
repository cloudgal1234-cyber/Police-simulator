# Precinct 12 — גרסת Unreal Engine 5

<div dir="rtl">

גרסת Unreal Engine 5 של משחק השיטור והבילוש. במשחק נוהגים בניידת, חוקרים זירות פשע, תוקלים עדים, מאשימים חשודים ומתמודדים בעימותים טקטיים. הגרפיקה כוללת:

- **Lumen:** תאורה גלובלית והשתקפויות בזמן אמת.
- **צללים חדים:** Virtual Shadow Maps.
- **שמיים ואווירה:** אטמוספירה פיזיקלית, עננים נפחיים וערפל נפחי.
- **עיבוד תמונה:** TSR (החלקת קצוות), טשטוש תנועה, Bloom וחשיפה אוטומטית.

## מה צריך להתקין (פעם אחת)

1. **Epic Games Launcher**: מ-https://store.epicgames.com. בלשונית Unreal Engine מתקינים **Unreal Engine 5.4** או גרסה חדשה יותר.
2. **Visual Studio 2022 Community** (חינמי): מ-https://visualstudio.microsoft.com. בזמן ההתקנה מסמנים:
   - **Game development with C++**
   - **Desktop development with C++**
3. כרטיס מסך שתומך ב-DirectX 12. מומלץ GeForce GTX 1070 / RX 5600 ומעלה.

## איך מריצים

1. מורידים את הקוד (`git clone`, או "Download ZIP" מ-GitHub) ונכנסים לתיקייה `unreal/PrecinctTwelve`.
2. לוחצים לחיצה כפולה על **`Setup-and-Run.bat`**. הסקריפט:
   - מוצא את Unreal Engine במחשב.
   - מקמפל את קוד המשחק (בפעם הראשונה זה לוקח כמה דקות).
   - פותח את העורך.
3. **בפתיחה הראשונה** סקריפט ההתקנה רץ אוטומטית: מייבא את הטקסטורות, בונה את החומרים ומעתיק את הדמויות המונפשות של Epic מתבנית Third Person שמגיעה עם המנוע. זה לוקח דקה או שתיים. גם הידור ה-shaders לוקח כמה דקות בפעם הראשונה.
4. לוחצים על **Play** (הכפתור הירוק, או Alt+P). כדי לשחק במסך מלא מחוץ לעורך: `Play-Fullscreen.bat`.

> בתוך העורך, Esc עוצר את המשחק. להשהיה משתמשים ב-**P**.

## הגה Xbox

הגאים מסוג Xbox / XInput (Logitech G920/G923 Xbox, Thrustmaster TMX/T248 Xbox) עובדים כמו בקר:
- סיבוב ההגה = היגוי
- דוושת הגז = RT
- דוושת הבלם = LT

חשוב לחבר את ההגה **לפני** שמפעילים את המשחק.

## מקשים

המסך הראשון במשחק מציג את כל המקשים. בקצרה:
- **נהיגה:** W/S, A/D, רווח (בלם יד), H (סירנה), F (כניסה ויציאה מהניידת), C (מצלמה).
- **ברגל:** WASD, עכבר, E (חקירה/דיבור), לחצן ימני ושמאלי בעכבר (כיוון וירי, רק בעימותים), R (טעינה), Tab (מחברת), M (מפה), P (השהיה).

## רמה של משחק Xbox: גרפיקה ריאליסטית

הקוד בנוי עם "חריצים" לנכסים ריאליסטיים. ב-**Project Settings ← Game ← Precinct 12** אפשר לשים:

| חריץ | מה לשים | מקור (חינמי) |
|---|---|---|
| Character Meshes + Anim Class | אנשים ריאליסטיים | **City Sample Crowds** מבית Epic ב-Fab, או **MetaHumans** |
| Police Car Mesh | ניידת ריאליסטית (Static Mesh) | חבילות רכבים מ-Fab (למשל **City Sample Vehicles**) |
| Civilian Car Meshes | רכבי תנועה ורכבים חונים | אותו מקור |

אפשר להוסיף נכסים מ-Fab ישירות מתוך העורך (Window ← Fab). אני ממליץ לבדוק ב-Fab את הרישיון והזמינות של כל חבילה.

בלי הנכסים האלה המשחק עובד עם דמויות הבובה המונפשות של Epic (Manny/Quinn) ועם מכוניות שבנויות מחלקים.

## אם יש שגיאת קימפול

הקוד נכתב בלי אפשרות לקמפל אותו בסביבה שבה נבנה. אם `Setup-and-Run.bat` מציג שגיאה, מעתיקים את שורות השגיאה (אלה שמכילות `error`) ושולחים לי, ואתקן.

</div>

---

## English summary

Unreal Engine 5 port of the browser prototype. The C++ module builds the whole world at runtime. The engine's empty `Entry` map is enough, so the project needs no binary map or Blueprint assets.

| File | What it does |
|---|---|
| `Source/PrecinctTwelve/*/PTGameMode` | Spawns the sun, sky atmosphere, volumetric clouds, sky light, fog and post-process, plus the city, traffic, pedestrians, cruiser and officer |
| `PTCity` | Procedural city: instanced textured buildings, windows, curbs, markings, lamps, trees and working traffic lights |
| `PTPoliceCar` | Arcade bicycle-model driving, swept collisions, light bar, headlights, chase and driver cameras, synthesized engine and siren |
| `PTOfficer`, `PTNPC`, `PTHuman` | Third-person officer, witnesses and suspects, pedestrians, cover-based standoff AI. Uses skeletal meshes from settings, with a procedural fallback |
| `PTCaseManager` | Dispatch, investigation, dialogue, evidence, accusation, standoff and wrap-up, driven by `Content/Data/Cases.json` |
| `PTHUD` | Canvas UI: objective tracker, minimap and GPS, compass, speedometer, dialogue, notebook, map, summaries, welcome and pause screens |
| `PTAudio` | Procedural audio (`USoundWaveProcedural`): engine, siren and horn, gunshots, UI sounds |
| `Content/Python/init_unreal.py` | First editor launch: imports `RawAssets/Textures`, builds `M_PT_Surface` (triplanar PBR with per-instance tint and emission), copies the Third Person mannequins |
| `Config/*.ini` | Lumen, virtual shadow maps, TSR, DX12, legacy input mappings for keyboard, Xbox controller and XInput wheels |

**Requirements:** UE 5.4+ and Visual Studio 2022 with the C++ game-development workload. Run `Setup-and-Run.bat`, wait for the first-launch setup, then press Play.

**Status:** this project was written without access to Unreal Engine, so it has not been compiled. Report any build errors and they'll be fixed.
