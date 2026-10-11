# Dense city layout revision

Human-requested city tuning replaces seven generated biomes with shopping/dining, waterfront and park. Existing DistrictKind values remain valid for legacy data and the component gallery. Planner cells expand from three to six chunks, and waterfront includes adjacent inland blocks. Side streets become 3.5 m (50% of 7 m); avenues are 5 m. Collision and shared boundary connectors use these same widths.

Commercial shop shells use four-to-eight floors; noodle shops use three-to-six. Footprints and renderers share floor parameters. Generator version 2 / catalog-2 distinguish these layouts from old saved manifests. Existing cached worlds are retained; old versions are rejected by the existing restore validator. Start a new city for a clean layout with the revised generator.

Building lots use aligned frontage/interior rows. Trees and street furniture occupy fixed sidewalk stations; parks use fixed feature rows. Claude receives the same density and placement guidance, while deterministic validation retains authority over geometry and quests.

Exploration density tuning: district cells now span two chunks (80 m), keeping park clusters smaller beyond the shopping-only spawn area. The fallback composer fits variable building widths and depths to the remaining lot before placement, so random oversized footprints do not unnecessarily empty narrow lots. Previously committed chunks retain their layouts; these changes apply to newly generated chunks.

Further building density tuning caps ordinary shop/noodle frontage at 5.5 m and packs compact interior shells in frontage coordinates, including east/west-facing lots. Rows retain 2 m pedestrian lanes and catalog clearances; streets, parks, water, quest reservations and rendering budgets stay under existing validation. Across the four regression seeds' 36 spawn-neighbourhood chunks, building count increases from 252 to 380 and building footprint coverage from 13,273 to 17,622 m². Claude receives matching compact frontage and back-lot guidance. Existing committed chunks remain unchanged; start a fresh city to see the change throughout the spawn neighbourhood.

Intersection signals are authored road decoration derived from manifest road intersections in ChunkRenderer. They do not add a placement, collider, route rule, interaction or frozen manifest field. A shared 66-second clock gives perpendicular approaches opposite phases (30 green, 3 amber, 33 red); Chinese labels and countdowns update each second. No interface changes are required.
