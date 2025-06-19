
Hip & Ridge Cap:
Chart Code:
Xactimate Line Item Descriptions:
Recommended Line item note:
Starter Row
Chart Code:
Xactimate Line Item Descriptions:
Recommended Line item note:
Drip Edge & Gutter Apron
Chart Code
Xactimate Line Item Descriptions:
Recommended Line item note:
Ice & Water Barrier
Chart Code
Xactimate Line Item Descriptions:
Recommended Line item note:
Hip & Ridge Cap:




Chart Code:

flowchart TD
    A([Start]) --> B[Analyze insurance<br/>carrier estimate]
    B --> C{Roof type?}

    %% ── Laminate composition shingles ──
    C -->|Laminate<br/>composition shingles| D[Inspect ridge cap line items]
    D --> E{Ridge cap type?}
    E -->|Purpose-built<br/>OR high-profile| F([No adjustment<br/>needed])
    E -->|Cut from 3-tab shingles| G[[Recommend adjusting<br/>estimate to use<br/>standard ridge-cap<br/>shingles]]

    %% ── 3-tab shingle roof ──
    C -->|3-tab shingle roof| I{Ridge cap line<br/>item present?}

    %% 3-tab branch — ridge cap present
    I -->|Yes| J{Ridge cap type?}
    J -->|Cut from 3-tab shingles| G
    J -->|Purpose-built<br/>OR high-profile| F2([No adjustment<br/>needed])

    %% 3-tab branch — no ridge cap line item
    I -->|No| G

    %% Styling
    classDef terminator fill:#dfe8f7,stroke:#2d64b3,stroke-width:2px;
    class A,F,G,F2 terminator

Xactimate Line Item Descriptions:
Purpose built Hip / Ridge cap: Hip / Ridge cap - Standard profile - composition shingles
High profile: Hip / Ridge cap - High profile - composition shingles
Cut from 3 tab shingles: Hip / Ridge cap - cut from 3 tab - composition shingles
Recommended Line item note:
Cut-up 3-tab shingles used as a starter course or as hip & ridge caps are not independently tested or rated for wind resistance under ASTM D3161 or ASTM D7158, and therefore have no assignable wind rating when used in those applications.

Starter Course: When a standard 3-tab shingle is cut and used as a starter, it does not include factory-applied adhesive strips along the edge, which are critical for wind uplift resistance at the eave and rake edges. As such, they fail to meet required uplift standards set forth in ASTM D3161 (Class A/D/F) or ASTM D7158 (Class D/G/H).

Hip & Ridge Cap: Major manufacturers do not test or rate cut 3-tab shingles for use on hips and ridges. These areas are the most wind-exposed parts of the roof. The bending required to fit a 3-tab over the ridge often causes cracking, granule loss, and adhesion failure — especially in cold weather.

ASTM Standards Only Apply to Fully Manufactured, Factory-Labeled Shingle Products
ASTM D3161 (“Standard Test Method for Wind-Resistance of Steep Slope Roofing Products”) and
ASTM D7158 (“Standard Wind Uplift Classification for Asphalt Shingles”) both explicitly:

Test complete shingle products as manufactured, not field-modified versions.

Require labeled, unaltered samples to be submitted for standardized wind testing.

Do not include procedures for testing shingles that have been cut down or installed contrary to manufacturer instructions.

ASTM D3161 and D7158 wind uplift ratings apply only to full, uncut shingles tested in their original manufactured condition. Once a 3-tab shingle is cut (to use as a starter strip or ridge cap), it no longer qualifies under these standards. Cut shingles are not tested, and do not meet wind performance classifications. Therefore, their use in such applications is non-compliant with ASTM standards, manufacturer instructions, and IRC 2018 Section R905.1.



















Starter Row





Chart Code:
flowchart TD
    %% ── Nodes ─────────────────────────────────────────────
    A([Start])
    B[Analyze insurance<br/>carrier estimate]
    C{Starter row<br/>line item present?}
    D{Starter row<br/>quality?}
    E{Linear feet ≥<br/>roof-report LF?}
    F([No adjustment<br/>needed])
    G[[Recommend adjusting<br/>starter-row LF to<br/>match roof report]]
    H[[Recommend adjusting<br/>estimate to use a<br/>universal starter row]]

    %% ── Flow ──────────────────────────────────────────────
    A --> B --> C
    C -->|Yes| D
    
    %% No starter row at all → add universal starter
    C -->|No| H         

    D -->|Universal starter<br/>or better| E
    
    %% Quality below universal → upgrade
    D -->|Lower quality| H   

    E -->|Yes| F
    E -->|No| G

    %% ── Styling (optional) ────────────────────────────────
    classDef terminator fill:#dfe8f7,stroke:#2d64b3,stroke-width:2px;
    class A,F,G,H terminator
Xactimate Line Item Descriptions:
Universal starter: Asphalt starter - universal starter course
Greater quality: Asphalt starter - peel and stick
Lower quality: In the carrier estimate, it would have text that would read something like this: 

Options: Valleys: Closed-cut (half laced), Include eave starter course: Yes, Include rake starter course: No, Exposure - Hip/Valley/Starter: 5 5/8",
Bundle Rounding: 0.4%, 0.08SQ - (included in waste calculation above)

Basically, this is the carrier telling the reader that the starter course has been factored into the waste for this roof. We don’t consider this accurate, as cut shingles are not tested for wind requirements, and therefore can’t comply with the building code as all materials must meet these testing requirements.
Recommended Line item note:
Starter Strips:
Manufacturers produce specialized starter strips (e.g., GAF Pro-Start®, Owens Corning Starter Strip Plus®, CertainTeed SwiftStart®).
Why?
Adhesive placement: Starter strips have properly positioned adhesive strips close to the roof's edge to ensure wind resistance. Field shingles, when cut, do not have this adhesive strip in the correct position.
Dimensions: Starter shingles are specifically designed and sized to create an appropriate drip edge overhang (typically ¼"–¾"). Cut 3-tabs frequently result in irregular and inadequate overhang.

When a standard 3-tab shingle is cut and used as a starter, it does not include factory-applied adhesive strips along the edge, which are critical for wind uplift resistance at the eave and rake edges. As such, they fail to meet required uplift standards set forth in ASTM D3161 (Class A/D/F) or ASTM D7158 (Class D/G/H).
























Drip Edge & Gutter Apron










Chart Code
flowchart TD
    %% ── Nodes ─────────────────────────────────────────────
    A([Start])
    B[Analyze insurance<br/>carrier estimate]
    C{Drip edge or<br/>gutter apron<br/>present?}
    D{Which item<br/>is present?}
    E{Drip edge LF ≥<br/>rake LF?}
    F{Gutter apron LF ≥<br/>eave LF?}
    G([No adjustment<br/>needed])
    H[[Recommend adjusting<br/>drip-edge LF to<br/>match rake LF]]
    I[[Recommend adjusting<br/>gutter-apron LF to<br/>match eave LF]]
    J[[Recommend adding<br/>drip edge at full<br/>rake LF **and**<br/>gutter apron at full<br/>eave LF]]

    %% ── Flow ──────────────────────────────────────────────
    A --> B --> C
    C -->|No| J         

    C -->|Yes| D
    D -->|Drip edge| E
    D -->|Gutter apron| F

    E -->|Yes| G
    E -->|No| H

    F -->|Yes| G
    F -->|No| I

    %% ── Styling (optional) ────────────────────────────────
    classDef terminator fill:#dfe8f7,stroke:#2d64b3,stroke-width:2px;
    class A,G,H,I,J terminator

Xactimate Line Item Descriptions:
Drip Edge: Drip edge
Gutter Apron: Drip edge/gutter apron
Recommended Line item note:
Drip edge and gutter apron are both essential components in a roofing system, but they serve different purposes and have distinct shapes designed for their specific functions, as well as different material costs.

Drip Edge is a metal flashing installed along the edges of a roof, particularly at the eaves and rakes. Its primary function is to direct water away from the fascia and the underlying roof structure. The drip edge is typically L-shaped, with one leg of the "L" extending underneath the roofing material and the other leg extending over the edge of the roof. This design helps guide water off the roof and into the gutter, preventing it from seeping under the shingles and causing damage to the roof deck and fascia boards.

Gutter Apron, on the other hand, is another type of metal flashing that is specifically designed to protect the edge of the roof where it meets the gutter. Unlike the L-shaped drip edge, a gutter apron has a more elongated, bent profile that extends further down the fascia and into the gutter itself. This shape allows it to effectively direct water from the roof into the gutter, minimizing the chance of water seeping behind the gutter and causing rot or water damage to the fascia.


























Ice & Water Barrier

Chart Code
flowchart TD
    %% ── Nodes ─────────────────────────────────────────────
    A([Start])
    B["Analyze insurance carrier estimate<br/>and roof report"]
    C["Compute code-required ice &amp; water barrier<br/>for heated structures (eaves&nbsp;+&nbsp;valleys)"]
    D{"I&amp;W barrier line item present?"}
    E{"Included quantity &amp;ge; required?"}
    F([No adjustment needed])
    G["Recommend adjusting I&amp;W quantity<br/>to code requirement"]
    H["Recommend adding I&amp;W barrier<br/>at code requirement"]

    %% ── Flow ──────────────────────────────────────────────
    A --> B --> C --> D
    D -->|No| H
    %% If absent → add full code-required amount
    D -->|Yes| E
    E -->|Yes| F
    %% Meets/exceeds → no further action
    E -->|No| G
    %% Shortfall → increase to code amount

    %% ── Styling (optional) ────────────────────────────────
    classDef terminator fill:#dfe8f7,stroke:#2d64b3,stroke-width:2px;
    class A,F,G,H terminator

Xactimate Line Item Descriptions:
Ice and Water barrier: Ice & water barrier
Recommended Line item note:
The model should generate a calculation that can be pasted into the estimate, like this:

Total IWS	1,167.2
Eave	1,167.2

Support: Using the predominant soffit depth of 24 inches, wall thickness of 6 inches, and a 6/12 roof pitch, the ice barrier must extend onto the roof's surface at least 60.4 inches from the lowest edge of all roof surfaces to a point not less than 24 inches inside the exterior wall line of the building.

Eave Calc: Round to the nearest square foot of IWS on the eave using an eave length of 232 LF * (60.4 inches / 12 inches) = 1,167.2 SF



R905.1.2 Ice Barriers
In areas where there has been a history of ice forming along the eaves causing a backup of water as designated in Table R301.2(1), an ice barrier shall be installed for asphalt shingles, metal roof shingles, mineral-surfaced roll roofing, slate and slate-type shingles, wood shingles and wood shakes. The ice barrier shall consist of not fewer than two layers of underlayment cemented together, or a self-adhering polymer-modified bitumen sheet shall be used in place of normal underlayment and extend from the lowest edges of all roof surfaces to a point not less than 24 inches (610 mm) inside the exterior wall line of the building. On roofs with slope equal to or greater than eight units vertical in 12 units horizontal (67-percent slope), the ice barrier shall also be applied not less than 36 inches (914 mm) measured along the roof slope from the eave edge of the building.
