import type { Localized } from '../messages'

/** Strings for `src/contentMap/*`. See `common.ts` for the typing convention. */
export const contentMapEn = {
  entry: {
    /** The link on a build row, next to the performance one. */
    build: 'Content map',
  },
  page: {
    back: '← Back to the builds',
    eyebrow: (buildId: string) => `Build ${buildId}`,
    title: 'Content map',
    subtitle:
      'What this build contains, as the server read it out of the evidence the SDK sent: its scenes, the capabilities in each one, and the transitions between them.',
    refresh: 'Refresh',
    readAt: (time: string) => `Read at ${time}`,
  },
  states: {
    loading: 'Loading the content map…',
    loadFailed: 'The content map could not be loaded.',
    retry: 'Retry',
    // Offline and "the refresh failed" are two different facts. In both cases
    // whatever is already on screen stays there, marked with the time it was
    // read — never presented as the current state of the build.
    offlineTitle: 'This browser is offline',
    offlineCopy: (time: string) =>
      `Nothing below has been checked since ${time}. It may already be out of date.`,
    staleTitle: 'The last refresh did not go through',
    staleCopy: (time: string) =>
      `What is shown is the content map as it was read at ${time}. Refresh to try again.`,
  },
  empty: {
    // Three different situations, three different next actions. Collapsing them
    // into one "no data" would leave the reader with nothing to do.
    neverUploadedTitle: 'Nothing has been scanned for this build yet',
    neverUploadedCopy:
      'A content map is built from the evidence a connected game sends. Ask one to scan above, and the scenes, capabilities and transitions appear here.',
    notIngestedTitle: 'The evidence is uploaded but has not been read yet',
    notIngestedCopy:
      'The document is stored against this build. Reading it is what turns it into scenes and capabilities.',
    noScenesTitle: 'The evidence was read and described no scene',
    noScenesCopy:
      'The document is ingested, so this is what it contains — not a loading state. Check that the export covered the scenes you expected.',
  },
  pending: {
    title: (count: number) => `${count} document${count === 1 ? '' : 's'} not read yet`,
    copy: 'The server has these but has not folded them into the map below.',
    waiting: 'Waiting to be read',
    failedAt: (time: string) => `Reading failed at ${time}`,
    documentLabel: (documentId: string) => `Document ${documentId}`,
    receivedAt: (time: string) => `received ${time}`,
  },
  scan: {
    title: 'Evidence',
    copy: 'The SDK sends the evidence itself. Ask a connected game to scan its content, and this map is rebuilt from what it sends.',
    instanceLabel: 'Game to scan',
    noInstanceOption: 'No connected game at the last check',
    action: 'Rescan evidence',
    running: 'Asking the game…',
    requested:
      'The scan was requested. This map changes once the game has sent its evidence and the server has read it — refresh to pick that up.',
    failed: 'The scan could not be started.',
    checkedAt: (time: string) =>
      `Connected games as of ${time}. Nothing is polling; refresh to check again.`,
    // Four reasons, four different things to do about it. One "cannot scan"
    // line would erase the difference between waiting, retrying, installing
    // the SDK, and starting the game.
    disabled: {
      loading: 'Checking which games are connected…',
      loadFailed: 'The connected games could not be checked, so a scan cannot be started yet.',
      noInstances:
        'No game has ever connected to this project. Install the SDK and run the game once, and it will appear here.',
      // The instance list is a snapshot from the last check, not a live
      // subscription, so the copy must not read as one.
      noneConnected: (time: string) =>
        `No game was connected as of ${time}. A scan runs inside the running game, so one has to be online — start the game and refresh.`,
    },
  },
  summary: {
    scenes: (count: number) => `${count} scene${count === 1 ? '' : 's'}`,
    walked: (count: number) => `${count} walked`,
    capabilities: (count: number) => `${count} capabilit${count === 1 ? 'y' : 'ies'}`,
    transitions: (count: number) => `${count} transition${count === 1 ? '' : 's'}`,
    capabilityTitle: 'Capabilities by status',
    statuses: {
      runnable: 'Runnable',
      needsProbe: 'Needs a probe',
      notAStep: 'Not a step',
      unreachablePrecondition: 'Unreachable precondition',
    },
    verificationTitle: 'Verified transitions',
    verificationRatio: (verified: number, total: number) => `${verified} of ${total}`,
    verificationNone: 'Nothing has been verified yet.',
    verificationLabel: (verified: number, total: number) =>
      `${verified} of ${total} transitions verified`,
    gapsTitle: 'Recorded gaps',
    noGaps: 'The server recorded no gaps.',
    // The gap vocabulary is not published, so the reason is printed exactly as
    // the server wrote it rather than guessed at.
    gapsNote: 'Reasons are shown exactly as the server recorded them.',
  },
  header: {
    title: 'This capture',
    captureLabel: 'Capture',
    schemaLabel: 'Schema version',
    digestLabel: 'Evidence digest',
    unityLabel: 'Unity',
    platformLabel: 'Platform',
    sdkLabel: 'SDK',
    ingestedAtLabel: 'Read at',
    notIngested: 'Not read yet',
    unknown: 'Not reported',
  },
  section: {
    title: 'Screen map',
    subtitle:
      'One scene holds several screens — overlays, popups, state branches. This draws them nested, so which scene a screen lives in is visible rather than inferred.',
    selectLabel: 'Build',
    noBuildsTitle: 'No build has registered itself yet',
    noBuildsCopy:
      'A build appears here once the SDK registers it from the editor or a player. There is nothing to draw until then.',
    sceneGraphLink: 'Scene graph for this build →',
  },
  // Pan and zoom, shared by every canvas in this directory.
  viewport: {
    // Told as a hint rather than an instruction: the gestures are the ones a
    // reader already expects from a map, and the sentence is there for the
    // reader who did not think to try them.
    hint: 'Drag to move the drawing, scroll to zoom.',
    scale: (times: number) => `${times.toFixed(times < 10 ? 1 : 0)}×`,
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Fit',
  },
  screenMap: {
    title: 'Scenes and the screens inside them',
    counts: (scenes: number, screens: number, transitions: number) =>
      `${scenes} scene${scenes === 1 ? '' : 's'}, ${screens} screen${screens === 1 ? '' : 's'}, ${transitions} screen transition${transitions === 1 ? '' : 's'}`,
    screenCount: (count: number) => `${count} screen${count === 1 ? '' : 's'}`,
    // Not an error and not a loading state. Static analysis cannot see screens,
    // so a build no QA run has played has none — and the drawing says so inside
    // each container rather than leaving an empty box to be read as unfinished.
    noScreens: 'No screen observed yet',
    noScreensTitle: 'No QA run has played this build yet',
    noScreensCopy: (count: number) =>
      `The ${count} scene${count === 1 ? '' : 's'} below ${count === 1 ? 'comes' : 'come'} from static analysis, which cannot see screens. Screens and the transitions between them are recorded by a QA run.`,
    unnamedScreen: 'Unnamed screen',
    observed: (count: number) => `${count}×`,
    legend: {
      verified: (count: number) =>
        `${count} scene transition${count === 1 ? '' : 's'} walked in a run — solid, filled head`,
      // The reason this screen exists. The count leads so the size of the hole
      // is read before the explanation of the line style.
      unverified: (count: number) =>
        `${count} scene transition${count === 1 ? '' : 's'} never walked — dashed, hollow head. This is the coverage hole.`,
      screenTransition: (count: number) =>
        `${count} screen transition${count === 1 ? '' : 's'} inside one scene — thin line, open head`,
      crossing: (count: number) =>
        `${count} screen transition${count === 1 ? '' : 's'} crossing a scene boundary — drawn through the container edge`,
      walked: 'A scene a run has stood in — solid container border',
      notWalked: 'A scene no run has stood in — dashed container border',
    },
  },
  graph: {
    title: 'Scene transitions',
    labelNote: 'Names are hidden while the graph is this large. The list beside it has them all.',
    noEdgesTitle: 'No transitions have been recorded',
    noEdgesCopy: (count: number) =>
      `${count} scene${count === 1 ? ' is' : 's are'} described, but nothing says how to get from one to another yet. Transitions come from static analysis of the build and from what a QA run actually walked.`,
    unmappedNote: (count: number) =>
      `${count} destination${count === 1 ? '' : 's'} in this drawing ${count === 1 ? 'is' : 'are'} not described by this content map. ${count === 1 ? 'It is' : 'They are'} drawn as an outline so a transition leading out of the map is still visible.`,
    // 그래프 위 조건 한 줄. 인스펙터가 트리를 펴는 것과 달리 여기는 접는 자리라,
    // `either` 와 `every` 를 다른 말로 잇는 것이 문구의 요점이다.
    conditionAlways: 'any time',
    conditionGesture: (input: string) => `input ${input}`,
    conditionUnknown: 'condition not read',
    conditionUnrecognised: (kind: string) => `unrecognised condition (${kind})`,
    conditionEmpty: 'condition with no parts',
    conditionEveryJoin: ' and ',
    conditionEitherJoin: ' or ',
    conditionMore: (shown: string, hidden: number) => `${shown} +${hidden} more`,
    conditionLabelNote:
      'Transition conditions are hidden while the graph is this large. Select a transition, or read them in the panel beside it.',
    legendSourceTitle: 'Where a transition came from',
    legendSceneTitle: 'Scenes',
    sources: {
      static: 'Static analysis',
      runtime: 'Observed in a run',
      unknown: 'Unrecognised source',
    },
    // Named in words as well as drawn, so the legend still works when the
    // colours cannot be told apart.
    sourceShapes: {
      static: 'dashed line',
      runtime: 'solid line',
      unknown: 'thin dotted line',
    },
    sceneKinds: {
      walked: 'Walked by a run',
      notWalked: 'Not walked yet',
      unmapped: 'Not in this content map',
    },
    sceneShapes: {
      walked: 'filled circle',
      notWalked: 'square',
      unmapped: 'dashed diamond',
    },
  },
  list: {
    heading: (count: number) => `${count} scene${count === 1 ? '' : 's'} in the drawing`,
    untitled: 'Scene with no name',
    unnamedDestination: 'Destination the server did not name',
    selectHint: 'Pick a scene to read its capabilities and the transitions that touch it.',
    clear: 'Clear',
    detailTitle: 'Selected scene',
    walked: 'Walked',
    notWalked: 'Not walked',
    unmapped: 'Not described by this content map',
    unmappedCopy:
      'A transition leads here, but this content map does not describe the scene. Either the evidence did not cover it, or it does not exist in the build.',
    sceneIdLabel: 'Scene id',
    nameOnly: 'Known by name only',
    thumbnailHeading: 'Screen',
    // 세 상태가 세 문장이다. 하나로 합치면 사용자가 기다려야 할지 고쳐야
    // 할지 알 수 없다.
    thumbnailNone: 'This scan did not report a screen capture for this scene.',
    thumbnailUnavailable: (reason: string) => `The scan could not capture this screen (${reason}).`,
    thumbnailBroken: 'The capture link expired or the image could not be loaded. Reload the page.',
    thumbnailSize: (width: number, height: number) => `${width} × ${height}`,
    capabilitiesHeading: 'Capabilities',
    noCapabilities: 'No capabilities were recorded for this scene.',
    transitionsHeading: (count: number) =>
      `${count} transition${count === 1 ? '' : 's'}`,
    noTransitions: 'No transition touches this scene.',
    directionOut: 'to',
    directionIn: 'from',
    directionSelf: 'back to itself',
    verifiedAt: (time: string) => `verified ${time}`,
    notVerified: 'not verified',
    capabilityLabel: (capabilityId: string) => `capability ${capabilityId}`,
    noCapabilityLink: 'no capability recorded',
  },
  // The panel beside the drawing. The drawing is pointer-only and `aria-hidden`,
  // so everything selectable there is a button here, and the evidence a 152×48
  // box has no room for lives here too.
  inspector: {
    title: 'Selected',
    clear: 'Clear',
    selectHint:
      'Pick a scene or a screen — in the drawing, or in the tree on the left. Its capture, what identifies it, and what can be done from it appear here.',
    missing: 'What was selected is no longer in this drawing.',

    screenTitle: 'Screen',
    // Nameless is the ordinary case, not a defect: a screen is split by
    // observation and the name is written afterwards, by an LLM, if at all.
    unnamedScreen: 'Unnamed screen',
    unnamedNote:
      'No one has named this screen yet, which is ordinary — the machine tells screens apart by the condition below, and the name is written afterwards.',
    screenIdLabel: 'Screen id',
    screenIdShort: (screenId: string) => `#${screenId}`,
    sceneLabel: 'Scene',
    sceneUnknown: 'Not in this drawing',
    screenUnknown: 'Screen not in this drawing',
    observedLabel: 'Observed',
    observedCount: (count: number) => `${count}×`,
    firstSeenLabel: 'First seen in run',
    firstSeenNone: 'Not recorded',

    captureHeading: 'Capture',
    // A real state, not an error and not a spinner. Every screen in a live build
    // is in it: a run records that the screen was reached, but uploading the
    // picture that goes with it is not wired up yet.
    captureNone: 'This screen has no capture yet',
    captureNoneCopy:
      'A QA run records that this screen was reached; the picture that goes with it is not being uploaded yet. Nothing failed, and there is nothing to wait for.',
    captureBroken: 'The capture link expired or the image could not be loaded. Reload the page.',
    captureAt: (time: string) => `Captured ${time}`,

    discriminatorHeading: 'What identifies this screen',
    discriminatorNone: 'The server recorded no condition for this screen.',
    // Shown verbatim rather than half-read. Folding an unrecognised shape into
    // the known one would show part of the condition as if it were all of it.
    discriminatorRawNote:
      'This build does not recognise the shape of this condition, so it is shown exactly as the server recorded it.',
    discriminatorEvery: (count: number) =>
      `${count} condition${count === 1 ? '' : 's'}, all of which hold on this screen:`,
    clauseActive: 'on',
    clauseInactive: 'off',

    capabilitiesHeading: 'What can be done here',
    // Says where the list came from and which part of it is observed. The
    // response carries capabilities per scene, never per screen, so the list is
    // the scene's — and each row says whether this screen was seen using it.
    capabilitiesNote:
      "These are the capabilities of the scene this screen belongs to; the response does not yet say which ones a screen offered. The rows a transition leaving this screen actually used are marked and listed first.",
    capabilitiesNone: 'This scene has no capability that is a step.',
    capabilitiesNotAStep: (count: number) =>
      `${count} further capabilit${count === 1 ? 'y' : 'ies'} in this scene ${count === 1 ? 'is' : 'are'} not a step, so ${count === 1 ? 'it is' : 'they are'} not listed here.`,
    capabilityUntitled: 'Capability the server did not summarise',
    capabilityMissing:
      'This capability is no longer in the content map, so its origin and verification cannot be read.',
    capabilityUsedHere: (count: number) =>
      `Used by ${count} transition${count === 1 ? '' : 's'} leaving this screen`,
    capabilityNotUsedHere: 'No transition leaving this screen was observed using it',

    originLabel: 'Origin',
    origins: {
      evidence: 'Evidence',
      observed: 'Observed',
      inferred: 'Inferred',
      human: 'Human',
    },
    originUnknown: (origin: string) =>
      origin.length > 0 ? `Unrecognised (${origin})` : 'Not recorded',
    verificationLabel: 'Verification',
    verifications: {
      unverified: 'Unverified',
      confirmed: 'Confirmed',
      contradicted: 'Contradicted',
    },
    verificationUnknown: (verification: string) =>
      verification.length > 0 ? `Unrecognised (${verification})` : 'Not recorded',

    knowledgeHeading: 'Knowledge anchored here',
    knowledgeNone: 'No knowledge item is anchored to this screen.',
    knowledgeLoading: 'Reading the knowledge base…',
    // Not folded into "none": one is a fact about the game, the other is a fact
    // about this page, and only the second is something to retry.
    knowledgeFailed: 'The knowledge base could not be read. The rest of this panel is unaffected.',

    screenTransitionsHeading: (count: number) =>
      `${count} transition${count === 1 ? '' : 's'} leaving this screen`,
    screenTransitionsNone: 'No transition leaving this screen has been observed.',
    incomingCount: (count: number) =>
      count === 0
        ? 'No observed transition arrives at this screen.'
        : `${count} observed transition${count === 1 ? '' : 's'} arrive${count === 1 ? 's' : ''} at this screen.`,
    transitionTo: (target: string) => `to ${target}`,
    transitionFrom: (source: string) => `from ${source}`,
    transitionPair: (from: string, to: string) => `${from} → ${to}`,
    // A transition has no verification column of its own. The capability that
    // caused it does, and a transition with no capability at all has nothing to
    // confirm — a different fact from one that was never confirmed.
    transitionNoCapability: 'No capability — nothing to confirm',
    transitionNoCapabilityCopy:
      'No capability is recorded for this transition, so there is nothing to confirm. An automatic transition — a timer, a load finishing — never has one, and neither does one whose capability was dropped when the map was re-ingested.',
    transitionCapabilityGone:
      'The capability behind this transition is no longer in the content map.',
    transitionKindLabel: 'Kind',
    transitionKinds: {
      action: 'Action',
      state: 'State change',
      auto: 'Automatic',
    },
    transitionKindUnknown: (kind: string) =>
      kind.length > 0 ? `Unrecognised kind ${kind}` : 'No kind recorded',
    transitionCapabilityHeading: 'What causes it',
    crossesScene: 'crosses a scene boundary',
    crossesSceneLabel: 'Scene boundary',
    crossesSceneYes: 'Crossed',
    crossesSceneNo: 'Stays inside one scene',

    sceneTitle: 'Scene',
    sceneScreensHeading: (count: number) =>
      `${count} screen${count === 1 ? '' : 's'} in this scene`,
    sceneScreensNone: 'No QA run has observed a screen in this scene yet.',
    sceneEdgesHeading: (count: number) =>
      `${count} transition${count === 1 ? '' : 's'} leaving this scene`,
    sceneEdgesNone: 'No transition leaves this scene.',
    sceneEdgesIncomingHeading: (count: number) =>
      `${count} transition${count === 1 ? '' : 's'} arriving at this scene`,
    sceneEdgesNoneIncoming: 'No transition arrives at this scene.',
    gapsHeading: 'Gap reasons',
    // Counted across the build. Saying so is the point: the response has no
    // per-scene breakdown, and presenting one would invent a number.
    gapsNote:
      'Counted across the whole build. The response does not break gap reasons down by scene.',
    gapsNone: 'The server recorded no gap for this build.',

    sceneEdgeTitle: 'Scene transition',
    screenTransitionTitle: 'Screen transition',
    edgePair: (from: string, to: string) => `${from} → ${to}`,
    edgeSourceLabel: 'Source',
    capabilityIdLabel: 'Capability id',
    openScene: (name: string) => `Open scene ${name}`,
    openScreen: (name: string) => `Open ${name}`,

  },
  // The tree beside the drawing. It is the only keyboard and screen-reader path
  // into the map, because the drawing itself is `aria-hidden` and pointer-only.
  tree: {
    title: 'Scenes, screens, and transitions',
    keyboardHint:
      'Arrow keys move between rows. Right and left open and close a row; Enter selects it.',
    empty: 'This build describes no scene.',
    sceneEdgeCount: (count: number) => `${count} out`,
    // A screen transition that leaves its scene is listed under the screen it
    // leaves from, once. This says where it goes so the row is not read as a
    // move inside one scene.
    crossesTo: (scene: string) => `leaves to ${scene}`,
    verified: 'Walked',
  },
  // What can actually be done in the selected scene. The counts above say how
  // many; this says which, and under what condition.
  steps: {
    heading: (count: number) => `${count} step${count === 1 ? '' : 's'}`,
    // Without this line the reader compares a step count against a capability
    // count and concludes the page lost some rows.
    notAStepNote: (count: number) =>
      `${count} further capabilit${count === 1 ? 'y is' : 'ies are'} not a step, so ${count === 1 ? 'it is' : 'they are'} not listed here.`,
    none: 'The server described no step for this scene.',
    untitled: 'Step the server did not summarise',
    // The status vocabulary belongs to the server. An unrecognised one is
    // printed as it arrived rather than folded into one this build knows.
    statusUnknown: (status: string) =>
      status.length > 0 ? `Unrecognised status ${status}` : 'No status recorded',
    interactions: {
      click: 'Click',
      press: 'Press',
      drag: 'Drag',
      none: 'No interaction',
    },
    interactionUnknown: (interaction: string) =>
      interaction.length > 0 ? `Unrecognised interaction ${interaction}` : 'No interaction recorded',
    inputKey: (key: string) => `key ${key}`,
    controlLabel: (label: string) => `control ${label}`,
    // Condition. Six runnable steps in one measured scene share their summary,
    // input key and status; only this tells them apart.
    conditionHeading: 'Condition',
    conditionNone: 'No condition was recorded for this step.',
    // Explicitly unconditional, which is a different fact from "not recorded"
    // and a different fact again from "we could not read it".
    conditionAlways: 'Runs whenever this step is reached — nothing gates it.',
    // The tree stays available once a sentence exists, folded away, because the
    // sentence is a rendering of it and a reader may need the original.
    conditionRawToggle: 'The condition as the server recorded it',
    conditionEvery: (count: number) => `All ${count} of these must hold:`,
    conditionEither: (count: number) => `Any one of these ${count} is enough:`,
    conditionKinds: {
      test: 'Check',
      gesture: 'Gesture',
      unknown: 'Could not be read',
      unrecognised: 'Unrecognised condition',
    },
    // Read out to a screen reader, which cannot rely on the spacing that tells
    // a sighted reader which side of the operator it is looking at.
    testLeft: 'left side',
    testOperator: 'operator',
    testRight: 'right side',
    gestureInput: 'input',
    conditionContext: (context: string) => `in ${context}`,
    // The server read the comparison but lost track of whose value it is. The
    // condition is half-read, and saying so is the point of the field.
    conditionSubjectLost: (subject: string) => `subject not resolved: ${subject}`,
    conditionOffset: (offset: number) => `offset ${offset}`,
    conditionReason: (reason: string) => `reason ${reason}`,
    conditionUnread: 'What the server could not read',
    // An empty kind is still a fact about the response, so it gets its own line
    // rather than an empty pair of quotes.
    conditionReportedKind: (kind: string) =>
      kind.length > 0
        ? `The server called this a ${kind}, which this page does not know how to read.`
        : 'The server sent a condition without a kind, so this page cannot read it.',
  },
} as const

export const contentMapKo: Localized<typeof contentMapEn> = {
  entry: {
    build: '콘텐츠 맵',
  },
  page: {
    back: '← 빌드 목록으로',
    eyebrow: (buildId: string) => `빌드 ${buildId}`,
    title: '콘텐츠 맵',
    subtitle:
      'SDK가 보낸 증거 문서를 서버가 읽어 낸 결과입니다. 이 빌드에 어떤 씬이 있고, 씬마다 어떤 능력이 있으며, 씬 사이를 어떻게 오가는지 보여 줍니다.',
    refresh: '새로고침',
    readAt: (time: string) => `${time} 기준`,
  },
  states: {
    loading: '콘텐츠 맵을 불러오는 중…',
    loadFailed: '콘텐츠 맵을 불러오지 못했습니다.',
    retry: '다시 시도',
    offlineTitle: '브라우저가 오프라인입니다',
    offlineCopy: (time: string) =>
      `${time} 이후로 아래 내용을 다시 확인하지 못했습니다. 이미 달라졌을 수 있습니다.`,
    staleTitle: '마지막 새로고침이 실패했습니다',
    staleCopy: (time: string) =>
      `아래는 ${time}에 읽어 둔 콘텐츠 맵입니다. 새로고침으로 다시 시도해 보세요.`,
  },
  empty: {
    neverUploadedTitle: '이 빌드는 아직 한 번도 스캔되지 않았습니다',
    neverUploadedCopy:
      '콘텐츠 맵은 붙어 있는 게임이 보낸 증거 문서로 만들어집니다. 위에서 스캔을 시키면 씬, 능력, 전이가 여기에 나타납니다.',
    notIngestedTitle: '증거는 올라왔지만 아직 읽히지 않았습니다',
    notIngestedCopy:
      '문서는 이 빌드에 저장돼 있습니다. 읽어야 씬과 능력으로 바뀝니다.',
    noScenesTitle: '증거를 읽었지만 씬이 하나도 없었습니다',
    noScenesCopy:
      '문서는 이미 반영됐으므로 이것이 문서의 내용입니다 — 로딩 중이 아닙니다. 내보내기가 기대한 씬을 포함했는지 확인해 보세요.',
  },
  pending: {
    title: (count: number) => `아직 적재되지 않은 문서 ${count}개`,
    copy: '서버가 받아 두었지만 아래 맵에는 아직 반영되지 않았습니다.',
    waiting: '적재 대기 중',
    failedAt: (time: string) => `${time}에 적재 실패`,
    documentLabel: (documentId: string) => `문서 ${documentId}`,
    receivedAt: (time: string) => `${time} 접수`,
  },
  scan: {
    title: '근거',
    copy: '근거 문서는 SDK가 스스로 올립니다. 붙어 있는 게임에 스캔을 시키면 게임이 보낸 내용으로 이 맵이 다시 만들어집니다.',
    instanceLabel: '스캔할 게임',
    noInstanceOption: '마지막 확인 때 붙어 있는 게임 없음',
    action: '근거 다시 스캔',
    running: '게임에 요청하는 중…',
    requested:
      '스캔을 요청했습니다. 게임이 근거를 보내고 서버가 그것을 읽으면 이 맵이 바뀝니다 — 새로고침으로 확인하세요.',
    failed: '스캔을 시작하지 못했습니다.',
    checkedAt: (time: string) =>
      `붙어 있는 게임 목록은 ${time} 기준입니다. 계속 지켜보고 있지는 않으니 새로고침으로 다시 확인하세요.`,
    disabled: {
      loading: '어떤 게임이 붙어 있는지 확인하는 중…',
      loadFailed: '붙어 있는 게임을 확인하지 못해 아직 스캔을 시작할 수 없습니다.',
      noInstances:
        '이 프로젝트에 붙은 적 있는 게임이 없습니다. SDK를 설치하고 게임을 한 번 실행하면 여기에 나타납니다.',
      noneConnected: (time: string) =>
        `${time} 기준으로 붙어 있는 게임이 없었습니다. 스캔은 실행 중인 게임 안에서 돌기 때문에 한 대는 켜져 있어야 합니다 — 게임을 켜고 새로고침해 주세요.`,
    },
  },
  summary: {
    scenes: (count: number) => `씬 ${count}개`,
    walked: (count: number) => `밟은 씬 ${count}개`,
    capabilities: (count: number) => `능력 ${count}개`,
    transitions: (count: number) => `전이 ${count}개`,
    capabilityTitle: '상태별 능력',
    statuses: {
      runnable: '실행 가능',
      needsProbe: '탐색 필요',
      notAStep: '단계 아님',
      unreachablePrecondition: '선행 조건 도달 불가',
    },
    verificationTitle: '확인된 전이',
    verificationRatio: (verified: number, total: number) => `${total}개 중 ${verified}개`,
    verificationNone: '아직 확인된 전이가 없습니다.',
    verificationLabel: (verified: number, total: number) =>
      `전이 ${total}개 중 ${verified}개 확인됨`,
    gapsTitle: '기록된 결손',
    noGaps: '서버가 기록한 결손이 없습니다.',
    gapsNote: '사유는 서버가 기록한 문자열 그대로입니다.',
  },
  header: {
    title: '이 캡처',
    captureLabel: '캡처',
    schemaLabel: '스키마 버전',
    digestLabel: '증거 다이제스트',
    unityLabel: 'Unity',
    platformLabel: '플랫폼',
    sdkLabel: 'SDK',
    ingestedAtLabel: '읽은 시각',
    notIngested: '아직 안 읽음',
    unknown: '보고 없음',
  },
  section: {
    title: '화면 지도',
    subtitle:
      '씬 하나에 화면이 여럿 든다 — overlay, popup, 상태 branch. 그것을 중첩해 그려서, 어느 화면이 어느 씬 안에 있는지를 짐작하지 않고 보게 한다.',
    selectLabel: '빌드',
    noBuildsTitle: '아직 등록된 빌드가 없습니다',
    noBuildsCopy:
      'SDK 가 에디터나 플레이어에서 빌드를 등록하면 여기 나타납니다. 그전에는 그릴 것이 없습니다.',
    sceneGraphLink: '이 빌드의 씬 그래프 →',
  },
  viewport: {
    hint: '끌어서 옮기고, 스크롤해서 확대·축소합니다.',
    scale: (times: number) => `${times.toFixed(times < 10 ? 1 : 0)}배`,
    zoomIn: '확대',
    zoomOut: '축소',
    reset: '전체 보기',
  },
  screenMap: {
    title: '씬과 그 안의 화면',
    counts: (scenes: number, screens: number, transitions: number) =>
      `씬 ${scenes}개 · 화면 ${screens}개 · 화면 전이 ${transitions}개`,
    screenCount: (count: number) => `화면 ${count}`,
    noScreens: '아직 관측된 화면 없음',
    noScreensTitle: '아직 이 빌드를 플레이한 QA 런이 없습니다',
    noScreensCopy: (count: number) =>
      `아래 씬 ${count}개는 정적 분석에서 나온 것이고, 정적 분석은 화면을 볼 수 없습니다. 화면과 화면 전이는 QA 런이 기록합니다.`,
    unnamedScreen: '이름 없는 화면',
    observed: (count: number) => `${count}회`,
    legend: {
      verified: (count: number) => `런이 밟아 본 씬 전이 ${count}개 — 실선, 속 찬 화살촉`,
      unverified: (count: number) =>
        `아직 못 가본 씬 전이 ${count}개 — 점선, 속 빈 화살촉. 이것이 커버리지 구멍이다.`,
      screenTransition: (count: number) => `씬 안에서 도는 화면 전이 ${count}개 — 가는 선, 열린 화살촉`,
      crossing: (count: number) => `씬 경계를 넘는 화면 전이 ${count}개 — 컨테이너 테두리를 뚫고 지나간다`,
      walked: '런이 서 본 씬 — 실선 컨테이너 테두리',
      notWalked: '아직 아무 런도 서 보지 않은 씬 — 점선 컨테이너 테두리',
    },
  },
  graph: {
    title: '씬 전이',
    labelNote: '그래프가 커서 이름은 감췄습니다. 옆 목록에 전부 있습니다.',
    noEdgesTitle: '기록된 전이가 없습니다',
    noEdgesCopy: (count: number) =>
      `씬 ${count}개는 있지만 씬 사이를 어떻게 오가는지는 아직 기록되지 않았습니다. 전이는 빌드의 정적 분석과 QA 실행이 실제로 밟은 경로에서 나옵니다.`,
    unmappedNote: (count: number) =>
      `이 그림의 목적지 ${count}개는 이 콘텐츠 맵이 설명하지 않는 씬입니다. 맵 밖으로 나가는 전이도 보이도록 윤곽선으로 그렸습니다.`,
    conditionAlways: '아무 때나',
    conditionGesture: (input: string) => `입력 ${input}`,
    conditionUnknown: '조건을 못 읽음',
    conditionUnrecognised: (kind: string) => `모르는 조건 (${kind})`,
    conditionEmpty: '내용이 빈 조건',
    conditionEveryJoin: ' 그리고 ',
    conditionEitherJoin: ' 또는 ',
    conditionMore: (shown: string, hidden: number) => `${shown} 외 ${hidden}개`,
    conditionLabelNote:
      '그래프가 커서 전이 조건은 감췄습니다. 전이를 고르거나 옆 패널에서 읽을 수 있습니다.',
    legendSourceTitle: '전이의 출처',
    legendSceneTitle: '씬',
    sources: {
      static: '정적 분석',
      runtime: '실행에서 관측',
      unknown: '알 수 없는 출처',
    },
    sourceShapes: {
      static: '파선',
      runtime: '실선',
      unknown: '가는 점선',
    },
    sceneKinds: {
      walked: '실행이 밟은 씬',
      notWalked: '아직 안 밟은 씬',
      unmapped: '이 콘텐츠 맵에 없는 씬',
    },
    sceneShapes: {
      walked: '채운 원',
      notWalked: '사각형',
      unmapped: '파선 마름모',
    },
  },
  list: {
    heading: (count: number) => `그림에 있는 씬 ${count}개`,
    untitled: '이름 없는 씬',
    unnamedDestination: '서버가 이름을 주지 않은 목적지',
    selectHint: '씬을 고르면 그 씬의 능력과 관련된 전이를 볼 수 있습니다.',
    clear: '선택 해제',
    detailTitle: '선택한 씬',
    walked: '밟음',
    notWalked: '안 밟음',
    unmapped: '이 콘텐츠 맵이 설명하지 않는 씬',
    unmappedCopy:
      '여기로 오는 전이는 있지만 이 콘텐츠 맵에는 이 씬이 없습니다. 증거가 이 씬을 담지 않았거나, 빌드에 존재하지 않는 씬입니다.',
    sceneIdLabel: '씬 id',
    nameOnly: '이름만 알려진 씬',
    thumbnailHeading: '화면',
    thumbnailNone: '이번 스캔은 이 씬의 화면 캡처를 신고하지 않았습니다.',
    thumbnailUnavailable: (reason: string) => `스캔이 이 화면을 캡처하지 못했습니다 (${reason}).`,
    thumbnailBroken: '캡처 주소가 만료됐거나 이미지를 불러오지 못했습니다. 새로고침하세요.',
    thumbnailSize: (width: number, height: number) => `${width} × ${height}`,
    capabilitiesHeading: '능력',
    noCapabilities: '이 씬에 기록된 능력이 없습니다.',
    transitionsHeading: (count: number) => `전이 ${count}개`,
    noTransitions: '이 씬에 닿는 전이가 없습니다.',
    directionOut: '나감:',
    directionIn: '들어옴:',
    directionSelf: '자기 자신으로',
    verifiedAt: (time: string) => `${time} 확인`,
    notVerified: '미확인',
    capabilityLabel: (capabilityId: string) => `능력 ${capabilityId}`,
    noCapabilityLink: '연결된 능력 없음',
  },
  inspector: {
    title: '고른 것',
    clear: '선택 해제',
    selectHint:
      '그림에서, 또는 왼쪽 tree 에서 scene 이나 screen 을 고르세요. 그 캡처와 무엇으로 판정되는지, 거기서 무엇을 할 수 있는지가 여기 뜹니다.',
    missing: '고른 것이 더 이상 이 그림에 없습니다.',

    screenTitle: 'Screen',
    unnamedScreen: '이름 없는 screen',
    unnamedNote:
      '아직 아무도 이 screen 에 이름을 붙이지 않았고, 그것이 보통입니다 — 기계는 아래 조건으로 screen 을 가르고 이름은 나중에 붙습니다.',
    screenIdLabel: 'Screen id',
    screenIdShort: (screenId: string) => `#${screenId}`,
    sceneLabel: 'Scene',
    sceneUnknown: '이 그림에 없음',
    screenUnknown: '이 그림에 없는 screen',
    observedLabel: '관측',
    observedCount: (count: number) => `${count}회`,
    firstSeenLabel: '처음 본 런',
    firstSeenNone: '기록 없음',

    captureHeading: '캡처',
    captureNone: '이 screen 은 아직 캡처가 없습니다',
    captureNoneCopy:
      'QA 런은 이 screen 에 닿았다는 것을 기록하지만, 그에 딸린 그림을 올리는 경로는 아직 없습니다. 실패한 것이 아니고, 기다릴 것도 없습니다.',
    captureBroken: '캡처 주소가 만료됐거나 이미지를 불러오지 못했습니다. 새로고침하세요.',
    captureAt: (time: string) => `${time} 촬영`,

    discriminatorHeading: '이 screen 을 판정하는 것',
    discriminatorNone: '서버가 이 screen 의 조건을 기록하지 않았습니다.',
    discriminatorRawNote:
      '이 빌드가 이 조건의 모양을 알지 못해, 서버가 기록한 원문 그대로 보입니다.',
    discriminatorEvery: (count: number) => `이 screen 에서 함께 성립하는 조건 ${count}개:`,
    clauseActive: '켜짐',
    clauseInactive: '꺼짐',

    capabilitiesHeading: '여기서 할 수 있는 일',
    capabilitiesNote:
      '이 screen 이 속한 scene 의 capability 입니다 — screen 이 어떤 capability 를 제공했는지는 응답에 아직 없습니다. 이 screen 에서 나가는 transition 이 실제로 쓴 것은 표시해 앞에 세웁니다.',
    capabilitiesNone: '이 scene 에는 단계가 되는 capability 가 없습니다.',
    capabilitiesNotAStep: (count: number) =>
      `이 scene 의 다른 capability ${count}개는 단계가 아니라서 여기에 없습니다.`,
    capabilityUntitled: '서버가 요약을 주지 않은 capability',
    capabilityMissing:
      '이 capability 가 콘텐츠 맵에 더 이상 없어서 origin 과 verification 을 읽을 수 없습니다.',
    capabilityUsedHere: (count: number) =>
      `이 screen 에서 나가는 transition ${count}개가 씁니다`,
    capabilityNotUsedHere: '이 screen 에서 쓰이는 것이 아직 관측되지 않았습니다',

    originLabel: 'Origin',
    origins: {
      evidence: '근거 문서',
      observed: '런에서 관측',
      inferred: '추론',
      human: '사람이 입력',
    },
    originUnknown: (origin: string) =>
      origin.length > 0 ? `알 수 없음 (${origin})` : '기록 없음',
    verificationLabel: 'Verification',
    verifications: {
      unverified: '미확인',
      confirmed: '확인됨',
      contradicted: '어긋남',
    },
    verificationUnknown: (verification: string) =>
      verification.length > 0 ? `알 수 없음 (${verification})` : '기록 없음',

    knowledgeHeading: '여기에 묶인 지식',
    knowledgeNone: '이 screen 에 묶인 지식 항목이 없습니다.',
    knowledgeLoading: '지식창고를 읽는 중…',
    knowledgeFailed: '지식창고를 읽지 못했습니다. 이 패널의 나머지는 그대로입니다.',

    screenTransitionsHeading: (count: number) => `이 screen 에서 나가는 transition ${count}개`,
    screenTransitionsNone: '이 screen 에서 나가는 transition 이 아직 관측되지 않았습니다.',
    incomingCount: (count: number) =>
      count === 0
        ? '이 screen 으로 들어오는 관측된 transition 이 없습니다.'
        : `이 screen 으로 들어오는 관측된 transition 이 ${count}개 있습니다.`,
    transitionTo: (target: string) => `${target} 으로`,
    transitionFrom: (source: string) => `${source} 에서`,
    transitionPair: (from: string, to: string) => `${from} → ${to}`,
    transitionNoCapability: 'Capability 없음 — 확인할 것이 없습니다',
    transitionNoCapabilityCopy:
      '이 transition 에 기록된 capability 가 없어서 확인할 것도 없습니다. 타이머나 로딩 완료 같은 자동 전이에는 애초에 capability 가 없고, 재적재로 capability 가 지워진 transition 도 마찬가지입니다.',
    transitionCapabilityGone: '이 transition 을 일으킨 capability 가 콘텐츠 맵에 더 이상 없습니다.',
    transitionKindLabel: '갈래',
    transitionKinds: {
      action: '조작',
      state: '상태 변화',
      auto: '자동',
    },
    transitionKindUnknown: (kind: string) =>
      kind.length > 0 ? `알 수 없는 갈래 ${kind}` : '갈래 기록 없음',
    transitionCapabilityHeading: '무엇이 일으키나',
    crossesScene: 'scene 경계를 넘음',
    crossesSceneLabel: 'Scene 경계',
    crossesSceneYes: '넘음',
    crossesSceneNo: '한 scene 안에 머무름',

    sceneTitle: 'Scene',
    sceneScreensHeading: (count: number) => `이 scene 의 screen ${count}개`,
    sceneScreensNone: '아직 어떤 QA 런도 이 scene 에서 screen 을 관측하지 않았습니다.',
    sceneEdgesHeading: (count: number) => `이 scene 에서 나가는 전이 ${count}개`,
    sceneEdgesNone: '이 scene 에서 나가는 전이가 없습니다.',
    sceneEdgesIncomingHeading: (count: number) => `이 scene 으로 들어오는 전이 ${count}개`,
    sceneEdgesNoneIncoming: '이 scene 으로 들어오는 전이가 없습니다.',
    gapsHeading: 'Gap 사유',
    gapsNote: '빌드 전체를 센 값입니다. 응답은 gap 사유를 scene 별로 가르지 않습니다.',
    gapsNone: '서버가 이 빌드의 gap 을 기록하지 않았습니다.',

    sceneEdgeTitle: 'Scene 전이',
    screenTransitionTitle: 'Screen transition',
    edgePair: (from: string, to: string) => `${from} → ${to}`,
    edgeSourceLabel: '출처',
    capabilityIdLabel: 'Capability id',
    openScene: (name: string) => `${name} scene 열기`,
    openScreen: (name: string) => `${name} 열기`,

  },
  tree: {
    title: 'Scene 과 screen 과 전이',
    keyboardHint:
      '위아래 화살표로 줄을 옮기고, 오른쪽·왼쪽 화살표로 펼치고 접습니다. Enter 로 고릅니다.',
    empty: '이 빌드에 scene 이 하나도 없습니다.',
    sceneEdgeCount: (count: number) => `나가는 길 ${count}개`,
    crossesTo: (scene: string) => `${scene} 으로 나감`,
    verified: '밟음',
  },
  steps: {
    heading: (count: number) => `조작 단계 ${count}개`,
    notAStepNote: (count: number) =>
      `이 씬의 다른 기능 ${count}개는 단계가 아니라서 여기에 없습니다.`,
    none: '서버가 이 씬의 조작 단계를 하나도 기록하지 않았습니다.',
    untitled: '서버가 요약을 주지 않은 단계',
    statusUnknown: (status: string) =>
      status.length > 0 ? `알 수 없는 상태 ${status}` : '상태 기록 없음',
    interactions: {
      click: '클릭',
      press: '누르기',
      drag: '끌기',
      none: '상호작용 없음',
    },
    interactionUnknown: (interaction: string) =>
      interaction.length > 0 ? `알 수 없는 상호작용 ${interaction}` : '상호작용 기록 없음',
    inputKey: (key: string) => `키 ${key}`,
    controlLabel: (label: string) => `컨트롤 ${label}`,
    conditionHeading: '조건',
    conditionNone: '이 단계에 기록된 조건이 없습니다.',
    conditionAlways: '이 단계에 닿기만 하면 실행됩니다 — 막는 조건이 없습니다.',
    conditionRawToggle: '서버가 기록한 조건 그대로',
    conditionEvery: (count: number) => `다음 ${count}가지를 모두 만족해야 합니다:`,
    conditionEither: (count: number) => `다음 ${count}가지 중 하나만 만족하면 됩니다:`,
    conditionKinds: {
      test: '검사',
      gesture: '제스처',
      unknown: '읽지 못함',
      unrecognised: '알 수 없는 조건',
    },
    testLeft: '왼쪽',
    testOperator: '연산자',
    testRight: '오른쪽',
    gestureInput: '입력',
    conditionContext: (context: string) => `위치 ${context}`,
    conditionSubjectLost: (subject: string) => `주체를 찾지 못함: ${subject}`,
    conditionOffset: (offset: number) => `오프셋 ${offset}`,
    conditionReason: (reason: string) => `사유 ${reason}`,
    conditionUnread: '서버가 읽지 못한 부분',
    conditionReportedKind: (kind: string) =>
      kind.length > 0
        ? `서버는 이것을 ${kind} 라고 했지만 이 화면은 그 종류를 읽을 줄 모릅니다.`
        : '서버가 종류 없는 조건을 보내서 이 화면이 읽을 수 없습니다.',
  },
}
