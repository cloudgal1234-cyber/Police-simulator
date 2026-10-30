/*
 * Case definitions. Positions are local to the case block's centre
 * (x right/east, z down/south; the block's road-facing open side is +z).
 *
 * evidence : everything that can go in the notebook (physical clues + statements)
 * clues    : physical clues in the world -> evidence id
 * npcs     : people to question. topics may require evidence (`req`) and may
 *            add evidence (`gives`).
 * culprit  : npc id that must be accused once `minEvidence` items are collected.
 * armed    : accusing the culprit triggers a short tactical standoff.
 */
(function (PD) {
  'use strict';

  PD.CASES = [
    // ------------------------------------------------------------------ 1
    {
      id: 'vandal',
      title: 'Vandalism at Greenway Park',
      location: 'Greenway Park, 4th & Birch',
      block: [4, 1],
      dispatch: 'Unit 12, respond to Greenway Park. Groundskeeper reports the founder\'s statue has been vandalised. Low priority — no injuries.',
      brief: 'Find out who vandalised the statue.',
      minEvidence: 4,
      culprit: 'tyler',
      evidence: {
        tag: { name: 'Fresh Graffiti', text: '"NO TOWERS" sprayed in neon green across the founder\'s statue. The paint is still tacky — this happened within the last hour or two.' },
        can: { name: 'Discarded Spray Can', text: 'Neon green spray paint with an "ArtHut" price sticker. The nozzle is clogged with the same green as the graffiti.' },
        flyer: { name: 'Protest Flyer', text: '"STOP THE GREENWAY TOWERS — Rally tonight!" Someone has hand-written "bring paint ;)" on the back.' },
        drips: { name: 'Green Paint Drips', text: 'A trail of neon green droplets leading away from the statue toward the benches on the west side of the park.' },
        s_hoodie: { name: 'Groundskeeper: grey hoodie', text: 'Hal saw someone in a grey hoodie loitering by the statue around 5:30 AM.', kind: 'statement' },
        s_arthut: { name: 'Jordan: ArtHut shopper', text: 'Jordan saw the guy now sitting on the west bench buying lots of spray paint at ArtHut yesterday.', kind: 'statement' },
        s_lena: { name: 'Lena: oil paints only', text: 'Lena\'s hands are stained cobalt blue oil paint, not green spray paint. She says a man in a grey hoodie was washing his hands at the fountain.', kind: 'statement' },
        s_sleeve: { name: 'Tyler: paint on sleeve', text: 'Tyler has neon green paint on his hoodie sleeve and openly opposes the towers.', kind: 'statement' },
        s_lie: { name: 'Tyler: "just arrived"', text: 'Tyler claims he only just got to the park.', kind: 'statement' },
      },
      props: [
        { type: 'statue', x: 0, z: -3 },
        { type: 'bench', x: -16, z: 14.5 },
        { type: 'bench', x: 13, z: -13, ry: Math.PI },
        { type: 'easel', x: -4, z: -9.5, ry: Math.PI * 0.85 },
        { type: 'skateboard', x: 10.2, z: 11 },
        { type: 'barrel', x: 13, z: -1 },
      ],
      clues: [
        { ev: 'tag', x: 0, z: -1.2, y: 0.9 },
        { ev: 'can', x: 7, z: 4, prop: 'spraycan' },
        { ev: 'flyer', x: -6, z: 8, prop: 'flyer', ry: 0.4 },
        { ev: 'drips', x: -11, z: 12, prop: 'drips', ry: -1.03 },
      ],
      npcs: [
        {
          id: 'hal', name: 'Hal Brennan', role: 'Groundskeeper', x: 4, z: -7.5, ry: -2.6,
          look: { shirt: 0x5d7a3a, pants: 0x4e3b2a, hat: 0x3d5a2a, skin: 0xe0ac69, hair: 0x8a8a8a },
          intro: 'Thirty years I\'ve kept this park clean, officer. Thirty years! Look at him...',
          topics: [
            { q: 'What did you see this morning?', a: 'I came in at six to empty the bins and it was already like this. Around half five I\'d noticed someone in a grey hoodie hanging round the statue — thought he was just an early jogger.', gives: 's_hoodie' },
            { q: 'Any trouble lately?', a: 'Ever since the council approved those Greenway Towers there\'ve been protesters here every night. Flyers everywhere.' },
            { q: 'Recognise this spray can?', req: 'can', a: 'ArtHut — that\'s the craft shop on 2nd. Half the kids round here buy their paint there.' },
          ],
        },
        {
          id: 'jordan', name: 'Jordan Pike', role: 'Skateboarder', x: 9, z: 10, ry: -2.2,
          look: { shirt: 0xe67e22, pants: 0x3b5998, hat: 0x111111, skin: 0x8d5524, hair: 0x111111 },
          intro: 'Whoa, officer. I didn\'t do anything, I swear.',
          wrong: 'Dude, seriously? My grip tape is green, not my hands! You\'ve got the wrong guy.',
          topics: [
            { q: 'Did you vandalise the statue?', a: 'No way! I just got here twenty minutes ago. Yeah my board\'s grip tape is green, but it\'s tape, not paint.' },
            { q: 'Recognise this spray can?', req: 'can', a: 'ArtHut? I can\'t even afford new wheels. But that dude on the west bench — I saw him buying like ten cans there yesterday.', gives: 's_arthut' },
          ],
        },
        {
          id: 'lena', name: 'Lena Sorensen', role: 'Painter', x: -5.2, z: -11, ry: 0.4,
          look: { shirt: 0xecf0f1, pants: 0x6d6d6d, skin: 0xffdbac, hair: 0xd9b26b, sleeve: 0x2255cc },
          intro: 'Good morning, officer. I paint the statue every Sunday... not like this, obviously.',
          wrong: 'Me? These are oil paints, officer — cobalt blue! I would never deface a work of art.',
          topics: [
            { q: 'There\'s paint on your hands.', a: 'Oil paint. Cobalt blue — see? Nothing green. I mix it on the palette right here.', gives: 's_lena' },
            { q: 'Did you see who did this?', req: 'tag', a: 'When I set up at six the graffiti was already there. There was a young man in a grey hoodie scrubbing his hands at the fountain. He went toward the benches.' },
          ],
        },
        {
          id: 'tyler', name: 'Tyler Voss', role: 'Student', x: -16, z: 16.3, ry: Math.PI * 0.9,
          look: { shirt: 0x8c8c8c, pants: 0x2c3e50, hood: 0x8c8c8c, skin: 0xffdbac, hair: 0x6b4423, sleeve: 0x8c8c8c },
          intro: 'Morning. I\'m just... enjoying the park. While it\'s still here.',
          topics: [
            { q: 'Were you here earlier?', a: 'No. Just got here, honestly. Like, five minutes ago.', gives: 's_lie' },
            { q: 'Is this flyer yours?', req: 'flyer', a: 'I support the cause, yeah. Lots of people do. Doesn\'t mean I did anything.' },
            { q: 'There\'s green paint on your sleeve.', req: 'drips', a: 'That\'s... from a poster! Look — those towers will bulldoze half this park. Somebody had to say something!', gives: 's_sleeve' },
          ],
        },
      ],
      arrestText: 'Tyler sighs. "Fine. It was me. I just wanted people to notice." He\'ll be cited for vandalism and ordered to clean the statue.',
    },

    // ------------------------------------------------------------------ 2
    {
      id: 'robbery',
      title: 'Armed Robbery — Quik-Stop Market',
      location: 'Quik-Stop Market, 2nd & Maple',
      block: [1, 1],
      dispatch: 'All units, 211 at the Quik-Stop Market, 2nd and Maple. Clerk reports an armed robbery, suspect may still be in the area. Use caution.',
      brief: 'Identify the robber. The suspect may be armed.',
      minEvidence: 4,
      culprit: 'vince',
      armed: true,
      evidence: {
        register: { name: 'Pried-Open Register', text: 'The cash drawer was forced with a flat tool — screwdriver scratches all around the lock. About $400 missing.' },
        fibers: { name: 'Red Wool Fibres', text: 'Bright red wool fibres snagged on the door hinge. Someone wearing red wool brushed past in a hurry.' },
        receipt: { name: 'Crumpled Receipt', text: 'Lottery ticket bought in cash at 9:42 PM — three minutes before the robbery. Scribbled on the back: "V — Dock 4".' },
        prints: { name: 'Sneaker Prints', text: 'Size 11 sneaker prints leading from the counter straight toward the bus stop.' },
        s_clerk: { name: 'Clerk: lottery buyer', text: 'Maya says the robber bought a lottery ticket minutes before returning with a screwdriver, face half covered.', kind: 'statement' },
        s_desc: { name: 'Clerk: description', text: 'Tall, dark hoodie, something red around his neck, big sneakers.', kind: 'statement' },
        s_priya: { name: 'Jogger: red scarf', text: 'Priya saw a man with a red scarf run out and sit down at the bus stop as if nothing happened.', kind: 'statement' },
        s_vince: { name: 'Vince: "never been inside"', text: 'Vince claims he has never been inside the store.', kind: 'statement' },
      },
      props: [
        { type: 'counter', x: 0, z: -12.4 },
        { type: 'door', x: 4.5, z: -13.9 },
        { type: 'busstop', x: 14, z: 22.5 },
        { type: 'bench', x: -14, z: 6 },
        { type: 'crates', x: 7, z: 8, cover: true },
        { type: 'crate', x: -6, z: 3, cover: true },
        { type: 'dumpster', x: 21.5, z: -8, cover: true },
        { type: 'barrel', x: -16, z: -6, cover: true },
      ],
      clues: [
        { ev: 'register', x: 0.6, z: -12.4, prop: 'register' },
        { ev: 'fibers', x: 3.85, z: -13.75, prop: 'scarf', y: 0.4 },
        { ev: 'receipt', x: -3, z: -6, prop: 'paper', ry: 0.6 },
        { ev: 'prints', x: 9, z: 2, prop: 'footprints', ry: 0.32 },
      ],
      npcs: [
        {
          id: 'maya', name: 'Maya Chen', role: 'Store Clerk', x: -2, z: -11, ry: 0,
          look: { shirt: 0xc0392b, vest: 0xc0392b, pants: 0x2c3e50, skin: 0xf1c27d, hair: 0x111111 },
          intro: 'Officer! Thank god. He took everything in the register...',
          wrong: 'No, no — that\'s not him! Please, the guy is getting away!',
          topics: [
            { q: 'Tell me what happened.', a: 'A guy came in and bought a lottery ticket, cash. Three minutes later he\'s back with his face half covered, waving a screwdriver and something in his jacket. He pried the drawer open and ran.', gives: 's_clerk' },
            { q: 'Can you describe him?', a: 'Tall. Dark hoodie. Something red around his neck — a scarf maybe. Big sneakers, really loud on the floor.', gives: 's_desc' },
            { q: 'About this receipt...', req: 'receipt', a: 'That\'s the ticket he bought! 9:42, yes. The "V — Dock 4" scribble isn\'t mine.' },
          ],
        },
        {
          id: 'dale', name: 'Dale Hutchins', role: 'Customer', x: -7.5, z: -5, ry: 0.5,
          look: { shirt: 0x7f8c8d, pants: 0x5d4037, skin: 0xffdbac, hair: 0x8a8a8a, hat: 0x5d4037 },
          intro: 'I was back by the freezers, didn\'t see much. My heart\'s still pounding.',
          wrong: 'Me?! I\'m seventy-three years old, officer!',
          topics: [
            { q: 'What did you see?', a: 'Just a flash of red as someone bolted out the door. He went right, toward the street.' },
            { q: 'These footprints lead to the bus stop.', req: 'prints', a: 'That fella sitting at the bus stop? He\'s been hanging around all evening. Never seen a bus come, either.' },
          ],
        },
        {
          id: 'priya', name: 'Priya Nair', role: 'Jogger', x: -12.2, z: 8.2, ry: 2.4,
          look: { shirt: 0x1abc9c, pants: 0x111111, skin: 0xc68642, hair: 0x111111 },
          intro: 'Can I go soon? I\'m freezing standing here.',
          wrong: 'Excuse me? I was jogging! Check my fitness tracker!',
          topics: [
            { q: 'Did you see anything?', a: 'A guy with a red scarf came running out of the store, then sat down at the bus stop like nothing happened. Weird, right?', gives: 's_priya' },
          ],
        },
        {
          id: 'vince', name: 'Vince Moretti', role: 'Waiting for the bus', x: 13.2, z: 23.3, ry: 0,
          look: { shirt: 0x222831, pants: 0x34495e, hood: 0x222831, scarf: 0xc0392b, skin: 0xe0ac69, hair: 0x111111, sleeve: 0x222831 },
          intro: 'What? I\'m just waiting for the bus, man.',
          topics: [
            { q: 'Were you in the Quik-Stop tonight?', a: 'Nah. Never been in there. Don\'t even like that place.', gives: 's_vince' },
            { q: 'Nice red scarf.', req: 'fibers', a: 'It\'s cold out. Lots of people wear red.' },
            { q: 'Does your name start with a V?', req: 'receipt', a: '...So what? Lots of names start with V. Am I free to go or what?' },
          ],
        },
      ],
      accomplices: [
        { name: 'Lookout', x: 25, z: -6, look: { shirt: 0x3d3d3d, pants: 0x222222, hood: 0x3d3d3d, skin: 0xc68642, hair: 0x111111 } },
      ],
      standoffText: 'Vince shoves you back and pulls a pistol! His lookout opens fire from the alley!',
      arrestText: 'Vince Moretti and his lookout are in custody. The cash is recovered from his jacket.',
    },

    // ------------------------------------------------------------------ 3
    {
      id: 'burglary',
      title: 'Burglary at Elm St. Apartments',
      location: 'Elm St. Apartments, 1st & Elm',
      block: [1, 4],
      dispatch: 'Unit 12, burglary report at Elm Street Apartments, unit 1B. Resident returned home to find her window smashed and valuables missing.',
      brief: 'Work out who really broke into unit 1B.',
      minEvidence: 5,
      culprit: 'kessler',
      evidence: {
        window: { name: 'Forced Window', text: 'Unit 1B\'s latch is bent — but the pry marks are on the INSIDE of the frame. It was opened from within to look like a break-in.' },
        glass: { name: 'Glass Shards', text: 'The glass lies outside on the path, not inside the flat. The window was broken outward.' },
        boots: { name: 'Muddy Work-Boot Prints', text: 'Heavy-tread work boots, size 12, leading from the window toward the maintenance shed.' },
        keys: { name: 'Master Key Ring', text: 'Tagged "ELM ST — ALL UNITS". Only building management carries a set like this.' },
        pawn: { name: 'Pawn Ticket', text: 'Gold & Gadget Pawn: one laptop, one gold necklace, pawned 11:20 this morning. Signed "R.K."' },
        s_access: { name: 'Ana: key holders', text: 'Only Ana and the landlord, Mr. Kessler, have keys to unit 1B.', kind: 'statement' },
        s_locked: { name: 'Ana: door was locked', text: 'Ana\'s front door was still locked when she got home.', kind: 'statement' },
        s_boots: { name: 'Gus: Kessler\'s boots', text: 'Gus says Kessler always wears big muddy work boots.', kind: 'statement' },
        s_alibi: { name: 'Sam: delivery log', text: 'Sam\'s scanner log shows him delivering to 2A at 12:10 for under two minutes.', kind: 'statement' },
        s_kessler: { name: 'Kessler: boiler alibi', text: 'Kessler claims he was fixing the boiler in the basement all morning.', kind: 'statement' },
      },
      props: [
        { type: 'window', x: -8, z: -9.85 },
        { type: 'shed', x: 18, z: -6 },
        { type: 'mailbox', x: 6, z: -9.4 },
        { type: 'flowerbed', x: -15, z: -7 },
        { type: 'van', x: 16, z: 12 },
        { type: 'bench', x: -12, z: 10 },
      ],
      clues: [
        { ev: 'window', x: -8, z: -9.3, y: 1.4 },
        { ev: 'glass', x: -8, z: -8, prop: 'glass' },
        { ev: 'boots', x: 0, z: -6, prop: 'footprints', ry: Math.PI / 2 },
        { ev: 'keys', x: 15, z: -3.6, prop: 'keys' },
        { ev: 'pawn', x: 9, z: 6, prop: 'paper', ry: 1.2 },
      ],
      npcs: [
        {
          id: 'ana', name: 'Ana Ruiz', role: 'Resident, Unit 1B', x: -5.5, z: -4, ry: 2.6,
          look: { shirt: 0x9b59b6, pants: 0x2c3e50, skin: 0xc68642, hair: 0x2b1b0e },
          intro: 'Someone broke in while I was at work! My laptop and my grandmother\'s necklace are gone.',
          wrong: 'I\'m the victim here! Why would I rob myself?',
          topics: [
            { q: 'When did you notice?', a: 'I came home for lunch at one. The window was smashed and my things were gone.' },
            { q: 'Who has keys to your flat?', a: 'Just me. Well — and Mr. Kessler, the landlord. He has a master key for repairs.', gives: 's_access' },
            { q: 'The window was forced from inside.', req: 'window', a: 'From inside? But my front door was still locked when I got home! Only someone with a key could have got in.', gives: 's_locked' },
          ],
        },
        {
          id: 'gus', name: 'Gus Pappas', role: 'Neighbour, Unit 1A', x: 3, z: 3, ry: Math.PI,
          look: { shirt: 0xecf0f1, pants: 0x6d6d6d, skin: 0xffdbac, hair: 0x8a8a8a },
          intro: 'I see everything from my window, officer. Everything.',
          wrong: 'Me? I can barely get up the stairs with my knee!',
          topics: [
            { q: 'Did you see anything today?', a: 'The delivery kid was hanging around at noon. Very suspicious, if you ask me. They\'re always in a rush.' },
            { q: 'Who wears work boots around here?', req: 'boots', a: 'Kessler. Clomps around in those big muddy boots all day long. Size of canoes.', gives: 's_boots' },
          ],
        },
        {
          id: 'sam', name: 'Sam Okafor', role: 'Delivery Driver', x: 13.3, z: 12, ry: -1.4,
          look: { shirt: 0x8b5a2b, pants: 0x5d4037, hat: 0x8b5a2b, skin: 0x8d5524, hair: 0x111111 },
          intro: 'I just drop off packages, officer. I didn\'t take anything!',
          wrong: 'Check my scanner! Every stop is time-stamped. This is ridiculous.',
          topics: [
            { q: 'What were you doing here?', a: 'Delivering to 2A at 12:10. In and out in two minutes — it\'s all on my scanner log.', gives: 's_alibi' },
            { q: 'Ever been to Gold & Gadget Pawn?', req: 'pawn', a: 'The pawn place on 5th? No. But I passed it this morning and Mr. Kessler\'s pickup was parked right out front.' },
          ],
        },
        {
          id: 'kessler', name: 'Roy Kessler', role: 'Landlord', x: 13.5, z: -9, ry: -0.5,
          look: { shirt: 0x2e6da4, pants: 0x3b5998, skin: 0xffdbac, hair: 0x6b4423, shoes: 0x4e342e },
          intro: 'Terrible business, officer. Terrible. Kids these days, no respect.',
          topics: [
            { q: 'Where were you this morning?', a: 'Fixing the boiler down in the basement. All morning. Ask anyone.', gives: 's_kessler' },
            { q: 'Your master keys were by the shed.', req: 'keys', a: 'I... must have dropped them. So what? I\'m the landlord, I go everywhere.' },
            { q: 'The pawn ticket is signed "R.K."', req: 'pawn', a: 'Lots of people are R.K.! ...Look. Half my tenants are late on rent. The bank\'s on my back.' },
          ],
        },
      ],
      arrestText: 'Kessler slumps. "I\'ll pay her back, I swear." He\'s arrested for burglary and insurance fraud; Ana\'s necklace is recovered from the pawn shop.',
    },

    // ------------------------------------------------------------------ 4
    {
      id: 'hitrun',
      title: 'Hit-and-Run outside Lucano\'s',
      location: 'Lucano\'s Valet Lot, 5th & Oak',
      block: [4, 4],
      dispatch: 'Unit 12, hit-and-run at Lucano\'s valet lot on 5th and Oak. Cyclist struck, transported with minor injuries. Vehicle fled the scene.',
      brief: 'Identify the driver who hit the cyclist.',
      minEvidence: 5,
      culprit: 'benny',
      evidence: {
        bike: { name: 'Mangled Bicycle', text: 'The cyclist was clipped from behind at the lot exit. Paramedics took them to St. Mary\'s — minor injuries.' },
        paint: { name: 'Blue Paint Chips', text: 'Metallic "Ocean Blue" paint flakes embedded in the bike frame.' },
        lens: { name: 'Headlight Fragments', text: 'Pieces of a front-left headlight lens, scattered at the exit of the lot.' },
        car: { name: 'Damaged Blue Sedan', text: 'Ocean Blue, plate 7KX-204. Front-left headlight smashed, fresh dent. The driver\'s seat is pushed all the way forward.' },
        ledger: { name: 'Valet Log', text: 'Plate 7KX-204 checked OUT at 7:08 PM and back IN at 7:21 PM, initials "B.T." The accident was reported at 7:14 PM.' },
        s_rick: { name: 'Rick: at dinner', text: 'Rick handed his keys to the valet at 6:30 and was inside Lucano\'s all evening.', kind: 'statement' },
        s_seat: { name: 'Rick: 6\'5"', text: 'Rick is six-foot-five — he couldn\'t drive with the seat pushed fully forward.', kind: 'statement' },
        s_witness: { name: 'Keisha: car came from lot', text: 'Keisha saw the blue car speed out of the valet lot and clip the cyclist.', kind: 'statement' },
        s_vest: { name: 'Keisha: red vest', text: 'The driver was short and wearing a red vest, like a uniform.', kind: 'statement' },
        s_benny: { name: 'Benny: "no cars moved"', text: 'Benny insists no cars have left the lot since 6 PM.', kind: 'statement' },
      },
      props: [
        { type: 'parkedcar', x: 10, z: -1, o: { color: 0x1f6fd1, damaged: true } },
        { type: 'parkedcar', x: -14, z: -1, o: { color: 0xecf0f1 } },
        { type: 'parkedcar', x: -2, z: -1, o: { color: 0x2c3e50 } },
        { type: 'parkedcar', x: -6, z: -20, ry: Math.PI, o: { color: 0xc0392b } },
        { type: 'parkedcar', x: 6, z: -20, ry: Math.PI, o: { color: 0x7f8c8d } },
        { type: 'parkedcar', x: 18, z: -20, ry: Math.PI, o: { color: 0x27ae60 } },
        { type: 'booth', x: -15, z: 14 },
        { type: 'cone', x: -3, z: 22.5 }, { type: 'cone', x: 3, z: 22.5 }, { type: 'cone', x: 0, z: 23 },
      ],
      clues: [
        { ev: 'bike', x: 0, z: 20, prop: 'bike', ry: 0.5 },
        { ev: 'paint', x: 1.8, z: 18.6, prop: 'chips' },
        { ev: 'lens', x: -2.2, z: 17.4, prop: 'glass' },
        { ev: 'car', x: 10.8, z: 1.7, y: 0.8 },
        { ev: 'ledger', x: -14.7, z: 15.2, y: 1.2 },
      ],
      npcs: [
        {
          id: 'rick', name: 'Rick Halvorsen', role: 'Car Owner', x: 14, z: 4, ry: -2,
          look: { shirt: 0xecf0f1, pants: 0x2c3e50, skin: 0xffdbac, hair: 0xd9b26b, scale: 1.12 },
          intro: 'That\'s MY car! Somebody wrecked my car and now I hear it hit a kid on a bike?!',
          wrong: 'I was eating linguine with six witnesses! This is outrageous!',
          topics: [
            { q: 'Where were you around 7 PM?', a: 'Inside Lucano\'s having dinner. Ask the waiter, ask my wife. I gave my keys to the valet at 6:30 and haven\'t been out since.', gives: 's_rick' },
            { q: 'The driver\'s seat is pulled all the way forward.', req: 'car', a: 'Forward? I\'m six-foot-five! I couldn\'t even get my knees under the wheel like that.', gives: 's_seat' },
          ],
        },
        {
          id: 'benny', name: 'Benny Tran', role: 'Valet', x: -12.6, z: 15.4, ry: 2.6,
          look: { shirt: 0xecf0f1, vest: 0xc0392b, pants: 0x111111, skin: 0xf1c27d, hair: 0x111111, scale: 0.9 },
          intro: 'Busy night, officer. What can I do for you?',
          topics: [
            { q: 'Did any cars leave the lot tonight?', a: 'Nope. Nobody\'s moved since six. Quiet night for cars, busy night for tips.', gives: 's_benny' },
            { q: 'Your log says 7KX-204 went out at 7:08.', req: 'ledger', a: 'That — I just moved it to a better spot! Customers like their cars up front.' },
            { q: 'A short guy in a red vest drove it — for 13 minutes?', req: ['ledger', 's_vest'], a: '...I just wanted to see what it could do. I didn\'t even see the bike until it was too late. I panicked.' },
          ],
        },
        {
          id: 'keisha', name: 'Keisha Grant', role: 'Witness', x: -5.5, z: 19.5, ry: 2.2,
          look: { shirt: 0xf1c40f, pants: 0x3b5998, skin: 0x8d5524, hair: 0x111111 },
          intro: 'I called it in. That poor kid — the car didn\'t even slow down.',
          wrong: 'I\'m the one who called 911!',
          topics: [
            { q: 'What did you see?', a: 'A blue car came flying out of the valet lot and clipped the cyclist, then took off down 5th. A few minutes later I swear I saw it come back.', gives: 's_witness' },
            { q: 'Did you see the driver?', a: 'Only for a second. Short guy, red vest — like some kind of uniform.', gives: 's_vest' },
          ],
        },
      ],
      arrestText: 'Benny Tran is arrested for leaving the scene of an accident and unauthorised use of a vehicle. The cyclist will make a full recovery.',
    },

    // ------------------------------------------------------------------ 5
    {
      id: 'warehouse',
      title: 'Shots Fired — Dockside Storage',
      location: 'Dockside Storage, 6th & Harbor',
      block: [5, 2],
      dispatch: 'All units, shots fired reported at Dockside Storage, 6th and Harbor. Security guard requesting assistance. Approach with caution.',
      brief: 'Find out what happened at the warehouse. Expect armed resistance.',
      minEvidence: 5,
      culprit: 'marco',
      armed: true,
      evidence: {
        casings: { name: '9mm Shell Casings', text: 'Three brass casings, still clean. Shots were fired here within the hour.' },
        padlock: { name: 'Cut Padlock', text: 'The warehouse padlock was cut with bolt cutters — from the inside, so somebody let themselves out, not in.' },
        crate: { name: 'Mislabelled Crate', text: 'Stencilled "MEDICAL SUPPLIES" but packed with counterfeit phones with fake serial numbers.' },
        manifest: { name: 'Torn Manifest', text: 'Night shipment signed for by "M. Duarte, Operations Manager".' },
        phone: { name: 'Burner Phone', text: 'Last text: "Cops sniffing around. Act normal. Deal still on at 10. — M"' },
        s_earl: { name: 'Earl: argument', text: 'Earl heard two men arguing near the crates before a shot was fired into the air.', kind: 'statement' },
        s_duarte: { name: 'Earl: Duarte in charge', text: 'Marco Duarte, the operations manager, is in charge tonight.', kind: 'statement' },
        s_rosa: { name: 'Rosa: night shipments', text: 'Duarte only lets his own crew unload the "medical" shipments that arrive at night.', kind: 'statement' },
        s_m: { name: 'Rosa: "M" is Marco', text: 'Rosa says Marco Duarte texts everyone from burner phones.', kind: 'statement' },
        s_fireworks: { name: 'Marco: "fireworks"', text: 'Duarte claims the noise was just fireworks.', kind: 'statement' },
      },
      props: [
        { type: 'crates', x: -5, z: -2, cover: true },
        { type: 'crates', x: 7, z: -4, cover: true },
        { type: 'crate', x: 12, z: 7.5, cover: true },
        { type: 'crate', x: 1, z: 11, cover: true },
        { type: 'barrel', x: -15, z: -6, cover: true },
        { type: 'opencrate', x: -10, z: 8 },
        { type: 'forklift', x: 15, z: -6 },
      ],
      clues: [
        { ev: 'casings', x: 1.5, z: 4, prop: 'casings' },
        { ev: 'padlock', x: 0.5, z: -11.2, prop: 'padlock' },
        { ev: 'crate', x: -10, z: 9.3, y: 0.6 },
        { ev: 'manifest', x: 11, z: -8.5, prop: 'paper', ry: 0.3 },
        { ev: 'phone', x: -14, z: 11, prop: 'phone', ry: 0.8 },
      ],
      npcs: [
        {
          id: 'earl', name: 'Earl Whitaker', role: 'Security Guard', x: -4, z: -8.5, ry: 0.3,
          look: { shirt: 0x7f8c8d, pants: 0x2c3e50, hat: 0x2c3e50, skin: 0x8d5524, hair: 0x8a8a8a, badge: true },
          intro: 'Thank the Lord you\'re here. I hid in the booth when the shooting started.',
          wrong: 'I\'m the one who called you! Forty years of honest work...',
          topics: [
            { q: 'What happened?', a: 'Two fellas were arguing over by the crates. Then — bang — somebody fired into the air and they scattered like pigeons.', gives: 's_earl' },
            { q: 'Who\'s in charge here tonight?', a: 'Mr. Duarte. Marco Duarte, the operations manager. He\'s around here somewhere, acting like nothing happened.', gives: 's_duarte' },
          ],
        },
        {
          id: 'rosa', name: 'Rosa Delgado', role: 'Forklift Operator', x: 9, z: 11, ry: -2.6,
          look: { shirt: 0xf39c12, vest: 0xf1c40f, pants: 0x3b5998, hat: 0xf1c40f, skin: 0xc68642, hair: 0x2b1b0e },
          intro: 'I just move pallets, officer. I keep my head down.',
          wrong: 'I just drive the forklift! Ask anyone!',
          topics: [
            { q: 'Seen anything strange lately?', a: 'Shipments marked "medical" coming in at night. Duarte only lets his own guys unload them. Nobody else is allowed near.', gives: 's_rosa' },
            { q: 'Who is "M"?', req: 'phone', a: 'Marco. Marco Duarte. He texts everyone from those cheap burner phones. Thinks he\'s in a movie.', gives: 's_m' },
          ],
        },
        {
          id: 'marco', name: 'Marco Duarte', role: 'Operations Manager', x: 12, z: -9.5, ry: -0.6,
          look: { shirt: 0x2c3e50, pants: 0x111111, skin: 0xe0ac69, hair: 0x111111, sleeve: 0x2c3e50 },
          intro: 'Officer. Simple misunderstanding, I promise you. Probably just fireworks.',
          topics: [
            { q: 'Were shots fired here?', a: 'Fireworks. Kids from the docks. Happens every week.', gives: 's_fireworks' },
            { q: 'These phones are counterfeit.', req: 'crate', a: 'I just sign papers, officer. I don\'t open the boxes.' },
            { q: 'Your signature\'s on this manifest.', req: 'manifest', a: '...You really should have left when I asked nicely.' },
          ],
        },
      ],
      accomplices: [
        { name: 'Crew Member', x: -20, z: -9, look: { shirt: 0x3d3d3d, pants: 0x222222, hat: 0x111111, skin: 0xe0ac69, hair: 0x111111 } },
        { name: 'Crew Member', x: 20, z: -9, look: { shirt: 0x4a2c2a, pants: 0x222222, skin: 0x8d5524, hair: 0x111111 } },
      ],
      standoffText: 'Duarte whistles — his crew comes out of the warehouse armed! Take cover!',
      arrestText: 'Marco Duarte\'s counterfeit ring is shut down. Three suspects in custody, $2M in fake electronics seized.',
    },
  ];
})(window.PD);
