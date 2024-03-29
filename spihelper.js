// <nowiki>
// Forked from https://github.com/GeneralNotability/spihelper
// @ts-check
// GeneralNotability's rewrite of Tim's SPI helper script
// With contributions from Dreamy Jazz, L235, Tamzin, TheresNoTime
// v2.7.1 "Counting forks"

/* global mw, $, displayMessage, spiHelperCustomOpts, wgULS */

// Adapted from [[User:Mr.Z-man/closeAFD]]
mw.loader.load('https://zh.wikipedia.org/w/index.php?title=User:Xiplus/js/spihelper.css&action=raw&ctype=text/css', 'text/css')
mw.loader.load('https://en.wikipedia.org/w/index.php?title=User:Timotheus_Canens/displaymessage.js&action=raw&ctype=text/javascript')

// Typedefs
/**
 * @typedef SelectOption
 * @type {Object}
 * @property {string} label Text to display in the drop-down
 * @property {string} value Value to return if this option is selected
 * @property {boolean} selected Whether this item should be selected by default
 * @property {boolean=} disabled Whether this item should be disabled
 */

/**
 * @typedef BlockEntry
 * @type {Object}
 * @property {string} username Username to block
 * @property {string} duration Duration of block
 * @property {boolean} acb If set, account creation is blocked
 * @property {boolean} ab Whether autoblock is enabled (for registered users)/
 *     logged-in users are blocked (for IPs)
 * @property {boolean} ntp If set, talk page access is blocked
 * @property {boolean} nem If set, email access is blocked
 * @property {string} tpn Type of talk page notice to apply on block
 */

/**
 * @typedef TagEntry
 * @type {Object}
 * @property {string} username Username to tag
 * @property {string} tag Tag to apply to user
 * @property {string} altmasterTag Altmaster tag to apply to user, if relevant
 * @property {boolean} blocking Whether this account is marked for block as well
 */

/**
  * @typedef ParsedArchiveNotice
  * @type {Object}
  * @property {string} username Case username
  * @property {boolean} xwiki Whether the crosswiki flag is set
  * @property {boolean} deny Whether the deny flag is set
  * @property {boolean} notalk Whether the notalk flag is set
  * @property {string} lta LTA page name
  */

// Globals

/* User setting related globals */

// User-configurable settings, these are the defaults but will be updated by
// spiHelperLoadSettings()
const spiHelperSettings = {
  // Choices are 'watch' (unconditionally add to watchlist), 'preferences'
  // (follow default preferences), 'nochange' (don't change the watchlist
  // status of the page), and 'unwatch' (unconditionally remove)
  watchCase: 'preferences',
  watchCaseExpiry: 'indefinite',
  watchArchive: 'nochange',
  watchArchiveExpiry: 'indefinite',
  watchTaggedUser: 'preferences',
  watchTaggedUserExpiry: 'indefinite',
  watchNewCats: 'nochange',
  watchNewCatsExpiry: 'indefinite',
  watchBlockedUser: true,
  watchBlockedUserExpiry: 'indefinite',
  // Lets people disable clerk options if they're not a clerk
  clerk: false,
  // Log all actions to Special:MyPage/spihelper_log
  log: false,
  // Reverse said log, so that the newest actions are at the top.
  reversed_log: false,
  // Enable the "move section" button
  iUnderstandSectionMoves: false,
  // Automatically tick the "Archive case" option if the case is closed
  tickArchiveWhenCaseClosed: true,
  // These are for debugging to view as other roles. If you're picking apart the code and
  // decide to set these (especially the CU option), it is YOUR responsibility to make sure
  // you don't do something that violates policy
  debugForceCheckuserState: null,
  debugForceAdminState: null
}

// Valid options for spiHelperSettings. Prevents invalid setting options being specified in the spioptions user subpage.
// This method only works options with discrete possible values. As such the expiry options will need to be accomodated for in spiHelperLoadSettings() via a check
// that validates it is a valid expiry option.
const spiHelperValidSettings = {
  watchCase: ['preferences', 'watch', 'nochange', 'unwatch'],
  watchArchive: ['preferences', 'watch', 'nochange', 'unwatch'],
  watchTaggedUser: ['preferences', 'watch', 'nochange', 'unwatch'],
  watchNewCats: ['preferences', 'watch', 'nochange', 'unwatch'],
  watchBlockedUser: ['preferences', 'watch', 'nochange', 'unwatch'],
  clerk: [true, false],
  log: [true, false],
  reversed_log: [true, false],
  iUnderstandSectionMoves: [true, false],
  tickArchiveWhenCaseClosed: [true, false],
  debugForceCheckuserState: [null, true, false],
  debugForceAdminState: [null, true, false]
}

const spiHelperSettingsNeedingValidDate = [
  'watchCaseExpiry',
  'watchArchiveExpiry',
  'watchTaggedUserExpiry',
  'watchNewCatsExpiry',
  'watchBlockedUserExpiry'
]

/* Globals to describe the current SPI page */

/** @type {string} Name of the SPI page in wiki title form
 * (e.g. Wikipedia:Sockpuppet investigations/Test) */
let spiHelperPageName = mw.config.get('wgPageName').replace(/_/g, ' ')

/** @type {number} The main page's ID - used to check if the page
 * has been edited since we opened it to prevent edit conflicts
 */
let spiHelperStartingRevID = mw.config.get('wgCurRevisionId')

const spiHelperIsThisPageAnArchive = mw.config.get('wgPageName').match('Wikipedia:傀儡調查/案件/.*/存檔.*')

/** @type {string} Just the username part of the case */
let spiHelperCaseName

if (spiHelperIsThisPageAnArchive) {
  spiHelperCaseName = spiHelperPageName.replace(/Wikipedia:傀儡調查\/案件\//g, '').replace(/\/存檔.*/, '')
} else {
  spiHelperCaseName = spiHelperPageName.replace(/Wikipedia:傀儡調查\/案件\//g, '')
}

/** list of section IDs + names corresponding to separate investigations */
let spiHelperCaseSections = []

/** @type {?number} Selected section, "null" means that we're opearting on the entire page */
let spiHelperSectionId = null

/** @type {?string} Selected section's name (e.g. "10 June 2020") */
let spiHelperSectionName = null

/** @type {ParsedArchiveNotice} */
let spiHelperArchiveNoticeParams

/** Map of top-level actions the user has selected */
const spiHelperActionsSelected = {
  Case_act: false,
  Block: false,
  Links: false,
  Note: false,
  Close: false,
  Rename: false,
  Archive: false,
  SpiMgmt: false
}

/** @type {BlockEntry[]} Requested blocks */
const spiHelperBlocks = []

/** @type {TagEntry[]} Requested tags */
const spiHelperTags = []

/** @type {string[]} Requested global locks */
const spiHelperGlobalLocks = []

// Count of unique users in the case (anything with a checkuser, checkip, user, ip, or vandal template on the page) for the block view
let spiHelperBlockTableUserCount = 0
// Count of unique users in the case (anything with a checkuser, checkip, user, ip, or vandal template on the page) for the link view (seperate needed as extra rows can be added)
let spiHelperLinkTableUserCount = 0

// The current wiki's interwiki prefix
const spiHelperInterwikiPrefix = spiHelperGetInterwikiPrefix()

// Map of active operations (used as a "dirty" flag for beforeunload)
// Values are strings representing the state - acceptable values are 'running', 'success', 'failed'
const spiHelperActiveOperations = new Map()

/* Globals to describe possible options for dropdown menus */

/** @type {SelectOption[]} List of possible selections for tagging a user in the block/tag interface
 */
const spiHelperTagOptions = [
  { label: wgULS('无', '無'), selected: true, value: '' },
  { label: wgULS('认为是傀儡', '認為是傀儡'), value: 'blocked', selected: false },
  { label: wgULS('确认为傀儡', '確認為傀儡'), value: 'proven', selected: false },
  { label: wgULS('查核确认为傀儡', '查核確認為傀儡'), value: 'confirmed', selected: false },
  { label: wgULS('确认为傀儡主账户', '確認為傀儡主帳號'), value: 'master', selected: false },
  { label: wgULS('查核确认为傀儡主账户', '查核確認為傀儡主帳號'), value: 'sockmasterchecked', selected: false }
  // { label: '3X banned master', value: 'bannedmaster', selected: false }
]

/** @type {SelectOption[]} List of possible selections for tagging a user's altmaster in the block/tag interface */
// const spiHelperAltMasterTagOptions = [
//   { label: wgULS('无', '無'), selected: true, value: '' },
//   { label: wgULS('认为是其他主账户的傀儡', '認為是其他主帳號的傀儡'), value: 'suspected', selected: false },
//   { label: wgULS('确认为其他主账户的傀儡', '確認為其他主帳號的傀儡'), value: 'proven', selected: false }
// ]

/** @type {SelectOption[]} List of templates that CUs might insert */
const spiHelperCUTemplates = [
  { label: wgULS('查核员模板', '查核員模板'), selected: true, value: '', disabled: true },
  { label: wgULS('已确认', '已確認'), selected: false, value: '{{confirmed}}' },
  { label: wgULS('已确认/无可奉告', '已確認/無可奉告'), selected: false, value: '{{confirmed-nc}}' },
  { label: wgULS('难以区分', '難以區分'), selected: false, value: '{{tallyho}}' },
  { label: '很可能', selected: false, value: '{{likely}}' },
  { label: wgULS('可能和很可能之间', '可能和很可能之間'), selected: false, value: '{{possilikely}}' },
  { label: '可能', selected: false, value: '{{possible}}' },
  { label: '不太可能', selected: false, value: '{{unlikely}}' },
  { label: wgULS('不相关', '不相關'), selected: false, value: '{{unrelated}}' },
  { label: wgULS('无结论', '無結論'), selected: false, value: '{{inconclusive}}' },
  { label: wgULS('需要评估行为证据', '需要評估行為證據'), selected: false, value: '{{behav}}' },
  // { label: 'No sleepers', selected: false, value: '{{nosleepers}}' },
  { label: wgULS('数据过期', '數據過期'), selected: false, value: '{{Stale}}' }
  // { label: 'No comment (IP)', selected: false, value: '{{ncip}}' },
]

/** @type {SelectOption[]} Templates that a clerk or admin might insert */
const spiHelperAdminTemplates = [
  { label: wgULS('管理员/助理模板', '管理員/助理模板'), selected: true, value: '', disabled: true },
  { label: '一望而知', selected: false, value: '{{duck}}' },
  { label: wgULS('明显的一望而知', '明顯的一望而知'), selected: false, value: '{{megaphoneduck}}' },
  { label: wgULS('已封禁IP', '已封鎖IP'), selected: false, value: '{{IPblock}}' },
  { label: wgULS('已封禁、标记', '已封鎖、標記'), selected: false, value: '{{Blockedandtagged}}' },
  { label: wgULS('已封禁、不标记', '已封鎖、不標記'), selected: false, value: '{{Blockedwithouttags}}' },
  { label: wgULS('已封禁、等待标记', '已封鎖、等待標記'), selected: false, value: '{{sblock}}' },
  { label: wgULS('已封禁、标记、关闭', '已封鎖、標記、關閉'), selected: false, value: '{{Blockedtaggedclosing}}' },
  { label: wgULS('请求的操作已完成，关闭', '請求的操作已完成，關閉'), selected: false, value: '{{Action and close}}' },
  { label: wgULS('需要更多信息', '需要更多資訊'), selected: false, value: '{{DiffsNeeded|moreinfo}}' },
  { label: wgULS('关闭', '關閉'), selected: false, value: '{{Close}}' }
  // { label: 'Locks requested', selected: false, value: '{{GlobalLocksRequested}}' },
]

/* Globals for regexes */

// Regex to match the case status, group 1 is the actual status
const spiHelperCaseStatusRegex = /{{\s*SPI case status\s*\|?\s*(\S*?)\s*}}/i
// Regex to match closed case statuses (close or closed)
const spiHelperCaseClosedRegex = /^closed?$/i

const spiHelperClerkStatusRegex = /{{(CURequest|awaitingadmin|clerk ?request|(?:self|requestand|cu)?endorse|inprogress|clerk ?decline|decline-ip|moreinfo|relisted|onhold)}}/i

const spiHelperSockSectionWithNewlineRegex = /====\s*疑似傀儡\s*====\n*/i

const spiHelperAdminSectionWithPrecedingNewlinesRegex = /\n*\s*====\s*調查助理、監管員、巡檢管理員的意見\s*====\s*/i

const spiHelperCUBlockRegex = /{{(checkuserblock(-account|-wide)?|checkuser block)}}/i

const spiHelperArchiveNoticeRegex = /{{\s*SPI\s*archive notice\|(?:1=)?([^|]*?)(\|.*)?}}/i

const spiHelperPriorCasesRegex = /{{spipriorcases}}/i

const spiHelperSectionRegex = /^(?:===[^=]*===|=====[^=]*=====)\s*$/m

// regex to remove hidden characters from form inputs - they mess up some things,
// especially mw.util.isIP
const spiHelperHiddenCharNormRegex = /\u200E/g

/* Other globals */

/** @type{string} Advert to append to the edit summary of edits */
const spihelperAdvert = '（使用[[:w:zh:User:Xiplus/js/spihelper|spihelper]]）'

/** Protection for userpage of blocked users */
const spiBlockedUserpageProtection = [
  { type: 'edit', level: 'sysop', expiry: 'infinity' },
  { type: 'move', level: 'sysop', expiry: 'infinity' }
]

/* Used by the link view */
const spiHelperLinkViewURLFormats = {
  editorInteractionAnalyser: { baseurl: 'https://sigma.toolforge.org/editorinteract.py', appendToQueryString: '', userQueryStringKey: 'users', userQueryStringSeparator: '&', userQueryStringWrapper: '', multipleUserQueryStringKeys: true, name: 'Editor Interaction Anaylser' },
  interactionTimeline: { baseurl: 'https://interaction-timeline.toolforge.org/', appendToQueryString: 'wiki=enwiki', userQueryStringKey: 'user', userQueryStringSeparator: '&', userQueryStringWrapper: '', multipleUserQueryStringKeys: true, name: 'Interaction Timeline' },
  timecardSPITools: { baseurl: 'https://spi-tools.toolforge.org/spi/timecard/' + spiHelperCaseName, appendToQueryString: '', userQueryStringKey: 'users', userQueryStringSeparator: '&', userQueryStringWrapper: '', multipleUserQueryStringKeys: true, name: 'Timecard comparisons' },
  consolidatedTimelineSPITools: { baseurl: 'https://spi-tools.toolforge.org/spi/timecard/' + spiHelperCaseName, appendToQueryString: '', userQueryStringKey: 'users', userQueryStringSeparator: '&', userQueryStringWrapper: '', multipleUserQueryStringKeys: true, name: 'Consolidated Timeline (requires login)' },
  pagesSPITools: { baseurl: 'https://spi-tools.toolforge.org/spi/timeline/' + spiHelperCaseName, appendToQueryString: '', userQueryStringKey: 'users', userQueryStringSeparator: '&', userQueryStringWrapper: '', multipleUserQueryStringKeys: true, name: 'SPI Tools Pages (requires login)' },
  checkUserWikiSearch: { baseurl: 'https://checkuser.wikimedia.org/w/index.php', appendToQueryString: 'ns0=1', userQueryStringKey: 'search', userQueryStringSeparator: ' OR ', userQueryStringWrapper: '"', multipleUserQueryStringKeys: false, name: 'Checkuser wiki search' }
}

/* Actually put the portlets in place if needed */
if (mw.config.get('wgPageName').includes('Wikipedia:傀儡調查/案件/')) {
  mw.loader.load('mediawiki.user')
  mw.loader.load('ext.gadget.site-lib')
  $(spiHelperAddLink)
}

// Main functions - do the meat of the processing and UI work

const spiHelperTopViewHTML = `
<div id="spiHelper_topViewDiv">
  <h3>` + wgULS('处理SPI案件', '處理SPI案件') + `</h3>
  <select id="spiHelper_sectionSelect"></select>
  <h4 id="spiHelper_warning" class="spihelper-errortext" hidden></h4>
  <ul>
    <li id="spiHelper_actionLine"  class="spiHelper_singleCaseOnly spiHelper_notOnArchive">
      <input type="checkbox" name="spiHelper_Case_Action" id="spiHelper_Case_Action" />
      <label for="spiHelper_Case_Action">` + wgULS('修改案件状态', '修改案件狀態') + `</label>
    </li>
    <li id="spiHelper_spiMgmtLine"  class="spiHelper_allCasesOnly">
      <input type="checkbox" id="spiHelper_SpiMgmt" />
      <label for="spiHelper_SpiMgmt">` + wgULS('修改SPI选项', '修改SPI選項') + `</label>
    </li>
    <li id="spiHelper_blockLine" class="spiHelper_adminClerkClass">
      <input type="checkbox" name="spiHelper_BlockTag" id="spiHelper_BlockTag" />
      <label for="spiHelper_BlockTag">` + wgULS('封禁/标记傀儡', '封鎖/標記傀儡') + `</label>
    </li>
    <li id="spiHelper_userInfoLine" class="spiHelper_singleCaseOnly">
      <input type="checkbox" name="spiHelper_userInfo" id="spiHelper_userInfo" />
      <label for="spiHelper_userInfo">` + wgULS('傀儡链接', '傀儡連結') + `</label>
    </li>
    <li id="spiHelper_commentLine" class="spiHelper_singleCaseOnly spiHelper_notOnArchive">
      <input type="checkbox" name="spiHelper_Comment" id="spiHelper_Comment" />
      <label for="spiHelper_Comment">留言</label>
    </li>
    <li id="spiHelper_closeLine" class="spiHelper_adminClerkClass spiHelper_singleCaseOnly spiHelper_notOnArchive">
      <input type="checkbox" name="spiHelper_Close" id="spiHelper_Close" />
      <label for="spiHelper_Close">` + wgULS('关闭案件', '關閉案件') + `</label>
    </li>
    <li id="spiHelper_moveLine" class="spiHelper_clerkClass spiHelper_notOnArchive">
      <input type="checkbox" name="spiHelper_Move" id="spiHelper_Move" />
      <label for="spiHelper_Move" id="spiHelper_moveLabel">` + wgULS('移动/合并整个案例（仅限助理）', '移動/合併整個案例（僅限助理）') + `</label>
    </li>
    <li id="spiHelper_archiveLine" class="spiHelper_clerkClass spiHelper_notOnArchive">
      <input type="checkbox" name="spiHelper_Archive" id="spiHelper_Archive"/>
      <label for="spiHelper_Archive">` + wgULS('存档案件（仅限助理）', '存檔案件（僅限助理）') + `</label>
    </li>
  </ul>
  <input type="button" id="spiHelper_GenerateForm" name="spiHelper_GenerateForm" value="` + wgULS('继续', '繼續') + `" />
</div>
`

/**
 * Initialization functions for spiHelper, displays the top-level menu
 */
async function spiHelperInit () {
  'use strict'
  spiHelperCaseSections = await spiHelperGetInvestigationSectionIDs()

  // Load archivenotice params
  spiHelperArchiveNoticeParams = await spiHelperParseArchiveNotice(spiHelperPageName.replace(/\/存檔.*/, ''))

  // First, insert the template text
  displayMessage(spiHelperTopViewHTML)

  // Narrow search scope
  const $topView = $('#spiHelper_topViewDiv', document)

  if (spiHelperArchiveNoticeParams.username === null) {
    // No archive notice was found
    const $warningText = $('#spiHelper_warning', $topView)
    $warningText.show()
    $warningText.append($('<b>').text(wgULS('找不到存档通知模板！自动将存档通知添加到页面。', '找不到存檔通知模板！自動將存檔通知添加到頁面。')))
    const newArchiveNotice = spiHelperMakeNewArchiveNotice(spiHelperCaseName, { xwiki: false, deny: false, notalk: false, lta: '' })
    let pagetext = await spiHelperGetPageText(spiHelperPageName, false)
    if (spiHelperPriorCasesRegex.exec(pagetext) === null) {
      pagetext = '{{SPIpriorcases}}\n' + pagetext
    }
    pagetext = newArchiveNotice + '\n' + pagetext
    if (pagetext.indexOf('__TOC__') === -1) {
      pagetext = '<noinclude>__TOC__</noinclude>\n' + pagetext
    }
    await spiHelperEditPage(spiHelperPageName, pagetext, wgULS('加入存档通知', '加入存檔通知'), false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry)
  }

  // Next, modify what's displayed
  // Set the block selection label based on whether or not the user is an admin
  $('#spiHelper_blockLabel', $topView).text(spiHelperIsAdmin() ? wgULS('封禁/标记傀儡', '封鎖/標記傀儡') : wgULS('标记傀儡', '標記傀儡'))

  // Wire up a couple of onclick handlers
  $('#spiHelper_Move', $topView).on('click', function () {
    spiHelperUpdateArchive()
  })
  $('#spiHelper_Archive', $topView).on('click', function () {
    spiHelperUpdateMove()
  })

  // Generate the section selector
  const $sectionSelect = $('#spiHelper_sectionSelect', $topView)
  $sectionSelect.on('change', () => {
    spiHelperSetCheckboxesBySection()
  })

  // Add the dates to the selector
  for (let i = 0; i < spiHelperCaseSections.length; i++) {
    const s = spiHelperCaseSections[i]
    $('<option>').val(s.index).text(s.line).appendTo($sectionSelect)
  }
  // All-sections selector...deliberately at the bottom, the default should be the first section
  $('<option>').val('all').text(wgULS('所有章节', '所有章節')).appendTo($sectionSelect)

  updateForRole($topView)

  // Only show options suitable for the archive subpage when running on the archives
  if (spiHelperIsThisPageAnArchive) {
    $('.spiHelper_notOnArchive', $topView).hide()
  }
  // Set the checkboxes to their default states
  spiHelperSetCheckboxesBySection()

  $('#spiHelper_GenerateForm', $topView).one('click', () => {
    spiHelperGenerateForm()
  })
}

const spiHelperActionViewHTML = `
<div id="spiHelper_actionViewDiv">
  <small><a id="spiHelper_backLink">` + wgULS('回到顶层菜单', '回到頂層選單') + `</a></small>
  <br />
  <h3>` + wgULS('处理SPI案件', '處理SPI案件') + `</h3>
  <div id="spiHelper_actionView">
    <h4>` + wgULS('修改案件状态', '修改案件狀態') + `</h4>
    <label for="spiHelper_CaseAction">` + wgULS('新状态：', '新狀態：') + `</label>
    <select id="spiHelper_CaseAction"></select>
  </div>
  <div id="spiHelper_spiMgmtView">
    <h4>` + wgULS('修改SPI选项', '修改SPI選項') + `</h4>
    <ul>
      <li>
        <input type="checkbox" id="spiHelper_spiMgmt_crosswiki" />
        <label for="spiHelper_spiMgmt_crosswiki">跨wiki案件</label>
      </li>
      <li>
        <input type="checkbox" id="spiHelper_spiMgmt_deny" />
        <label for="spiHelper_spiMgmt_deny">` + wgULS('根据en:WP:DENY不应标记傀儡', '根據en:WP:DENY不應標記傀儡') + `</label>
      </li>
      <li>
        <input type="checkbox" id="spiHelper_spiMgmt_notalk" />
        <label for="spiHelper_spiMgmt_notalk">` + wgULS('由于之前滥用过，傀儡应被禁止编辑讨论页及发送电子邮件', '由於之前濫用過，傀儡應被禁止編輯討論頁及發送電子郵件') + `</label>
      </li>
      <li>
        <label for="spiHelper_moveTarget">` + wgULS('LTA页面名称：', 'LTA頁面名稱：') + `</label>
        <input type="text" name="spiHelper_spiMgmt_lta" id="spiHelper_spiMgmt_lta" />
      </li>
    </ul>
  </div>
  <div id="spiHelper_sockLinksView">
    <h4 id="spiHelper_sockLinksHeader">` + wgULS('傀儡常用链接', '傀儡常用連結') + `</h4>
    <table id="spiHelper_userInfoTable" style="border-collapse:collapse;">
      <tr>
        <th>` + wgULS('用户名', '使用者名稱') + `</th>
        <th><span title="Editor interaction analyser" class="rt-commentedText spihelper-hovertext">Interaction analyser</span></th>
        <th><span title="Interaction timeline" class="rt-commentedText spihelper-hovertext">Interaction timeline</span></th>
        <th><span title="Timecard comparison - SPI tools" class="rt-commentedText spihelper-hovertext">Timecard</span></th>
        <th class="spiHelper_adminClass"><span title="Consolidated timeline (login needed) - SPI tools" class="rt-commentedText spihelper-hovertext">Consolidated timeline</span></th>
        <th class="spiHelper_adminClass"><span title="Pages - SPI tools (login needed)" class="rt-commentedText spihelper-hovertext">Pages</span></th>
        <th class="spiHelper_cuClass"><span title="CheckUser wiki search" class="rt-commentedText spihelper-hovertext">CU wiki</span></th>
      </tr>
      <tr style="border-bottom:2px solid black">
        <td style="text-align:center;">` + wgULS('（所有用户）', '（所有使用者）') + `</td>
        <td style="text-align:center;"><input type="checkbox" id="spiHelper_link_editorInteractionAnalyser"/></td>
        <td style="text-align:center;"><input type="checkbox" id="spiHelper_link_interactionTimeline"/></td>
        <td style="text-align:center;"><input type="checkbox" id="spiHelper_link_timecardSPITools"/></td>
        <td style="text-align:center;" class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_link_consolidatedTimelineSPITools"/></td>
        <td style="text-align:center;" class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_link_pagesSPITools"/></td>
        <td style="text-align:center;" class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_link_checkUserWikiSearch"/></td>
      </tr>
    </table>
    <span><input type="button" id="moreSerks" value="新增一行" onclick="spiHelperAddBlankUserLine('block');"/></span>
  </div>
  <div id="spiHelper_blockTagView">
    <h4 id="spiHelper_blockTagHeader">` + wgULS('封禁和标记傀儡', '封鎖和標記傀儡') + `</h4>
    <ul>
      <li class="spiHelper_adminClass">
        <input type="checkbox" name="spiHelper_noblock" id="spiHelper_noblock" />
        <label for="spiHelper_noblock">` + wgULS('不要进行任何封禁（这会覆盖下方的“封禁”单选框）', '不要進行任何封鎖（這會覆蓋下方的「封鎖」單選框）') + `</label>
      </li>
      <li class="spiHelper_adminClass">
        <input type="checkbox" checked="checked" name="spiHelper_override" id="spiHelper_override" />
        <label for="spiHelper_override">` + wgULS('覆盖现有的任何封禁', '覆蓋現有的任何封鎖') + `</label>
      </li>
      <li class="spiHelper_clerkClass">
        <input type="checkbox" name="spiHelper_tagAccountsWithoutLocalAccount" id="spiHelper_tagAccountsWithoutLocalAccount" />
        <label for="spiHelper_tagAccountsWithoutLocalAccount">` + wgULS('标记没有附加本地账户的账户。', '標記沒有附加本地帳號的帳號。') + `</label>
      </li>
      <li class="spiHelper_adminClass">
        <input type="checkbox" name="spiHelper_blockSummaryNoLink" id="spiHelper_blockSummaryNoLink" />
        <label for="spiHelper_blockSummaryNoLink">` + wgULS('封禁摘要不链接到调查页面', '封鎖摘要不連結到調查頁面') + `（WP:DENY）</label>
      </li>
      <li class="spiHelper_cuClass">
        <input type="checkbox" name="spiHelper_cublock" id="spiHelper_cublock" />
        <label for="spiHelper_cublock">` + wgULS('标记为用户查核封禁', '標記為使用者查核封鎖') + `</label>
      </li>
      <li class="spiHelper_cuClass">
        <input type="checkbox" name="spiHelper_cublockonly" id="spiHelper_cublockonly" />
        <label for="spiHelper_cublockonly">
          ` + wgULS('不使用常规的封禁摘要，仅使用{{checkuserblock-account}}和{{checkuserblock}}（如果未选择“标记为用户查核封禁”则无效）', '不使用常規的封鎖摘要，僅使用{{checkuserblock-account}}和{{checkuserblock}}（如果未選擇「標記為使用者查核封鎖」則無效）') + `
        </label>
      </li>
      <li class="spiHelper_adminClass">
        <input type="checkbox" name="spiHelper_blocknoticemaster" id="spiHelper_blocknoticemaster" />
        <label for="spiHelper_blocknoticemaster">` + wgULS('封禁主账户时发送讨论页通知', '封鎖主帳號時發送討論頁通知') + `</label>
      </li>
      <li class="spiHelper_adminClass">
        <input type="checkbox" name="spiHelper_blocknoticesocks" id="spiHelper_blocknoticesocks" />
        <label for="spiHelper_blocknoticesocks">` + wgULS('封禁傀儡时发送讨论页通知', '封鎖傀儡時發送討論頁通知') + `</label>
      </li>
      <li class="spiHelper_adminClass">
        <input type="checkbox" name="spiHelper_blanktalk" id="spiHelper_blanktalk" />
        <label for="spiHelper_blanktalk">` + wgULS('发送讨论页通知前先清空讨论页', '發送討論頁通知前先清空討論頁') + `</label>
      </li>
      <li>
        <input type="checkbox" name="spiHelper_hidelocknames" id="spiHelper_hidelocknames" />
        <label for="spiHelper_hidelocknames">` + wgULS('请求全域锁定时隐藏用户名', '請求全域鎖定時隱藏使用者名稱') + `</label>
      </li>
    </ul>
    <table id="spiHelper_blockTable" style="border-collapse:collapse;">
      <tr>
        <th>` + wgULS('用户名', '使用者名稱') + `</th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('封禁用户', '封鎖使用者') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('封禁', '封鎖') + `</span></th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('封禁期限', '封鎖期限') + `" class="rt-commentedText spihelper-hovertext">期限</span></th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('禁止创建账户', '禁止建立帳號') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('建账', '建帳') + `</span></th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('自动封禁（对于账户）/仅限匿名用户（对于IP）', '自動封鎖（對於帳號）/僅限匿名使用者（對於IP）') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('自动/仅匿', '自動/僅匿') + `</span></th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('禁止编辑讨论页', '禁止編輯討論頁') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('讨论', '討論') + `</span></th>
        <th class="spiHelper_adminClass"><span title="` + wgULS('禁止发送电子邮件', '禁止發送電子郵件') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('邮件', '郵件') + `</span></th>
        <th>` + wgULS('标记', '標記') + `</th>
        <th><span title="` + wgULS('在Meta:SRG请求全域锁定', '在Meta:SRG請求全域鎖定') + '" class="rt-commentedText spihelper-hovertext">' + wgULS('锁定', '鎖定') + `</span></th>
      </tr>
      <tr style="border-bottom:2px solid black">
        <td style="text-align:center;">` + wgULS('（所有用户）', '（所有使用者）') + `</td>
        <td class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_block_doblock"/></td>
        <td class="spiHelper_adminClass"></td>
        <td class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_block_acb" checked="checked"/></td>
        <td class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_block_ab" checked="checked"/></td>
        <td class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_block_tp"/></td>
        <td class="spiHelper_adminClass"><input type="checkbox" id="spiHelper_block_email"/></td>
        <td><select id="spiHelper_block_tag"></select></td>
        <td><input type="checkbox" name="spiHelper_block_lock_all" id="spiHelper_block_lock"/></td>
      </tr>
    </table>
    <span><input type="button" id="moreSerks" value="新增一行" onclick="spiHelperAddBlankUserLine('block');"/></span>
  </div>
  <div id="spiHelper_closeView">
    <h4>` + wgULS('将案件标记为关闭', '將案件標記為關閉') + `</h4>
    <input type="checkbox" checked="checked" id="spiHelper_CloseCase" />
    <label for="spiHelper_CloseCase">` + wgULS('关闭SPI案件', '關閉SPI案件') + `</label>
  </div>
  <div id="spiHelper_moveView">
    <h4 id="spiHelper_moveHeader">` + wgULS('移动章节', '移動章節') + `</h4>
    <label for="spiHelper_moveTarget">` + wgULS('新的主账户用户名：', '新的主帳號使用者名稱：') + `</label>
    <input type="text" name="spiHelper_moveTarget" id="spiHelper_moveTarget" />
    <br />
    <input type="checkbox" checked="checked" id="spiHelper_AddOldName" />
    <label for="spiHelper_AddOldName">` + wgULS('加上原始案件名称', '加上原始案件名稱') + `</label>
  </div>
  <div id="spiHelper_archiveView">
    <h4>` + wgULS('存档案件', '存檔案件') + `</h4>
    <input type="checkbox" checked="checked" name="spiHelper_ArchiveCase" id="spiHelper_ArchiveCase" />
    <label for="spiHelper_ArchiveCase">` + wgULS('存档此SPI案件', '存檔此SPI案件') + `</label>
  </div>
  <div id="spiHelper_commentView">
    <h4>留言</h4>
    <span>
      <select id="spiHelper_noteSelect"></select>
      <select class="spiHelper_adminClerkClass" id="spiHelper_adminSelect"></select>
      <select class="spiHelper_cuClass" id="spiHelper_cuSelect"></select>
    </span>
    <div>
      <label for="spiHelper_CommentText">留言：</label>
      <textarea rows="3" cols="80" id="spiHelper_CommentText">* </textarea>
      <div><a id="spiHelper_previewLink">` + wgULS('预览', '預覽') + `</a></div>
    </div>
    <div class="spihelper-previewbox" id="spiHelper_previewBox" hidden></div>
  </div>
  <input type="button" id="spiHelper_performActions" value="完成" />
</div>
`
/**
 * Big function to generate the SPI form from the top-level menu selections
 *
 * Would fail ESlint no-unused-vars due to only being
 * referenced in an onclick event
 *
 * @return {Promise<void>}
 */
// eslint-disable-next-line no-unused-vars
async function spiHelperGenerateForm () {
  'use strict'
  spiHelperBlockTableUserCount = 0
  spiHelperLinkTableUserCount = 0
  const $topView = $('#spiHelper_topViewDiv', document)
  spiHelperActionsSelected.Case_act = $('#spiHelper_Case_Action', $topView).prop('checked')
  spiHelperActionsSelected.Block = $('#spiHelper_BlockTag', $topView).prop('checked')
  spiHelperActionsSelected.Link = $('#spiHelper_userInfo', $topView).prop('checked')
  spiHelperActionsSelected.Note = $('#spiHelper_Comment', $topView).prop('checked')
  spiHelperActionsSelected.Close = $('#spiHelper_Close', $topView).prop('checked')
  spiHelperActionsSelected.Rename = $('#spiHelper_Move', $topView).prop('checked')
  spiHelperActionsSelected.Archive = $('#spiHelper_Archive', $topView).prop('checked')
  spiHelperActionsSelected.SpiMgmt = $('#spiHelper_SpiMgmt', $topView).prop('checked')
  const pagetext = await spiHelperGetPageText(spiHelperPageName, false, spiHelperSectionId)
  if (!(spiHelperActionsSelected.Case_act ||
    spiHelperActionsSelected.Note || spiHelperActionsSelected.Close ||
    spiHelperActionsSelected.Archive || spiHelperActionsSelected.Block || spiHelperActionsSelected.Link ||
    spiHelperActionsSelected.Rename || spiHelperActionsSelected.SpiMgmt)) {
    displayMessage('')
    return
  }

  displayMessage(spiHelperActionViewHTML)

  // Reduce the scope that jquery operates on
  const $actionView = $('#spiHelper_actionViewDiv', document)

  // Wire up the action view
  $('#spiHelper_backLink', $actionView).one('click', () => {
    spiHelperInit()
  })
  if (spiHelperActionsSelected.Case_act) {
    const result = spiHelperCaseStatusRegex.exec(pagetext)
    let casestatus = ''
    if (result) {
      casestatus = result[1]
    }
    const canAddCURequest = (casestatus === '' || /^(?:admin|moreinfo|cumoreinfo|hold|cuhold|clerk|open)$/i.test(casestatus))
    const cuRequested = /^(?:CU|checkuser|CUrequest|request|cumoreinfo)$/i.test(casestatus)
    const cuEndorsed = /^(?:endorse(d)?)$/i.test(casestatus)
    const cuCompleted = /^(?:inprogress|checking|relist(ed)?|checked|completed|declined?|cudeclin(ed)?)$/i.test(casestatus)

    /** @type {SelectOption[]} Generated array of values for the case status select box */
    const selectOpts = [
      { label: wgULS('无操作', '無操作'), value: 'noaction', selected: true }
    ]
    if (spiHelperCaseClosedRegex.test(casestatus)) {
      selectOpts.push({ label: wgULS('重开', '重開'), value: 'reopen', selected: false })
    } else if (spiHelperIsClerk() && casestatus === 'clerk') {
      // Allow clerks to change the status from clerk to open.
      // Used when clerk assistance has been given and the case previously had the status 'open'.
      selectOpts.push({ label: wgULS('待处理', '待處理'), value: 'open', selected: false })
    } else if (spiHelperIsAdmin() && casestatus === 'admin') {
      // Allow admins to change the status to open from admin
      // Used when admin assistance has been given to the non-admin clerk and the case previously had the status 'open'.
      selectOpts.push({ label: wgULS('待处理', '待處理'), value: 'open', selected: false })
    }
    if (spiHelperIsCheckuser()) {
      selectOpts.push({ label: wgULS('进行中', '進行中'), value: 'inprogress', selected: false })
    }
    if (spiHelperIsClerk() || spiHelperIsAdmin()) {
      selectOpts.push({ label: wgULS('需要更多信息', '需要更多資訊'), value: 'moreinfo', selected: false })
    }
    if (canAddCURequest) {
      // Statuses only available if the case could be moved to "CU requested"
      selectOpts.push({ label: wgULS('请求查核', '請求查核'), value: 'CUrequest', selected: false })
      if (spiHelperIsClerk()) {
        selectOpts.push({ label: wgULS('请求查核并自我批准', '請求查核並自我批准'), value: 'selfendorse', selected: false })
      }
    }
    // CU already requested
    if (cuRequested) {
      selectOpts.push({ label: wgULS('社群共识转交查核', '社群共識轉交查核'), value: 'condefer', selected: false })
    }
    if (cuRequested && spiHelperIsClerk()) {
      // Statuses only available if CU has been requested, only clerks + CUs should use these
      selectOpts.push({ label: '批准查核', value: 'endorse', selected: false })
      // Switch the decline option depending on whether the user is a checkuser
      if (spiHelperIsCheckuser()) {
        selectOpts.push({ label: wgULS('查核员批准查核', '查核員批准查核'), value: 'cuendorse', selected: false })
      }
      if (spiHelperIsCheckuser()) {
        selectOpts.push({ label: wgULS('查核员拒绝查核', '查核員拒絕查核'), value: 'cudecline', selected: false })
      }
      selectOpts.push({ label: wgULS('拒绝查核', '拒絕查核'), value: 'decline', selected: false })
      selectOpts.push({ label: wgULS('需要更多信息以决定是否查核', '需要更多資訊以決定是否查核'), value: 'cumoreinfo', selected: false })
    } else if (cuEndorsed && spiHelperIsCheckuser()) {
      // Let checkusers decline endorsed cases
      if (spiHelperIsCheckuser()) {
        selectOpts.push({ label: wgULS('查核员拒绝查核', '查核員拒絕查核'), value: 'cudecline', selected: false })
      }
      selectOpts.push({ label: wgULS('查核员要求更多信息以决定是否查核', '查核員要求更多資訊以決定是否查核'), value: 'cumoreinfo', selected: false })
    }
    // This is mostly a CU function, but let's let clerks and admins set it
    //  in case the CU forgot (or in case we're un-closing))
    if (spiHelperIsAdmin() || spiHelperIsClerk()) {
      selectOpts.push({ label: '完成查核', value: 'checked', selected: false })
    }
    if (spiHelperIsClerk() && cuCompleted) {
      selectOpts.push({ label: '重新提出查核', value: 'relist', selected: false })
    }
    if (spiHelperIsCheckuser()) {
      selectOpts.push({ label: wgULS('查核员搁置', '查核員擱置'), value: 'cuhold', selected: false })
    }
    // I guess it's okay for anyone to have this option
    selectOpts.push({ label: wgULS('搁置', '擱置'), value: 'hold', selected: false })
    selectOpts.push({ label: wgULS('请求助理协助', '請求助理協助'), value: 'clerk', selected: false })
    // I think this is only useful for non-admin clerks to ask admins to do stuff
    if (!spiHelperIsAdmin() && spiHelperIsClerk()) {
      selectOpts.push({ label: wgULS('请求管理员协助', '請求管理員協助'), value: 'admin', selected: false })
    }
    // Generate the case action options
    spiHelperGenerateSelect('spiHelper_CaseAction', selectOpts)
    // Add the onclick handler to the drop-down
    $('#spiHelper_CaseAction', $actionView).on('change', function (e) {
      spiHelperCaseActionUpdated($(e.target))
    })
  } else {
    $('#spiHelper_actionView', $actionView).hide()
  }

  if (spiHelperActionsSelected.SpiMgmt) {
    const $xwikiBox = $('#spiHelper_spiMgmt_crosswiki', $actionView)
    const $denyBox = $('#spiHelper_spiMgmt_deny', $actionView)
    const $notalkBox = $('#spiHelper_spiMgmt_notalk', $actionView)
    const $ltaBox = $('#spiHelper_spiMgmt_lta', $actionView)

    $xwikiBox.prop('checked', spiHelperArchiveNoticeParams.xwiki)
    $denyBox.prop('checked', spiHelperArchiveNoticeParams.deny)
    $notalkBox.prop('checked', spiHelperArchiveNoticeParams.notalk)
    $ltaBox.val(spiHelperArchiveNoticeParams.lta)
  } else {
    $('#spiHelper_spiMgmtView', $actionView).hide()
  }

  if (!spiHelperActionsSelected.Close) {
    $('#spiHelper_closeView', $actionView).hide()
  }
  if (!spiHelperActionsSelected.Archive) {
    $('#spiHelper_archiveView', $actionView).hide()
  }
  // Only give the option to comment if we selected a specific section and we are not running on an archive subpage
  if (spiHelperSectionId && !spiHelperIsThisPageAnArchive) {
    // generate the note prefixes
    /** @type {SelectOption[]} */
    const spiHelperNoteTemplates = [
      { label: '留言模板', selected: true, value: '', disabled: true }
    ]
    if (spiHelperIsClerk()) {
      spiHelperNoteTemplates.push({ label: wgULS('助理备注', '助理備註'), selected: false, value: 'clerknote' })
    }
    if (spiHelperIsAdmin()) {
      spiHelperNoteTemplates.push({ label: wgULS('管理员备注', '管理員備註'), selected: false, value: 'adminnote' })
    }
    if (spiHelperIsCheckuser()) {
      // spiHelperNoteTemplates.push({ label: wgULS('查核员备注', '查核員備註'), selected: false, value: 'cunote' })
    }
    spiHelperNoteTemplates.push({ label: wgULS('备注', '備註'), selected: false, value: 'takenote' })

    // Wire up the select boxes
    spiHelperGenerateSelect('spiHelper_noteSelect', spiHelperNoteTemplates)
    $('#spiHelper_noteSelect', $actionView).on('change', function (e) {
      spiHelperInsertNote($(e.target))
    })
    spiHelperGenerateSelect('spiHelper_adminSelect', spiHelperAdminTemplates)
    $('#spiHelper_adminSelect', $actionView).on('change', function (e) {
      spiHelperInsertTextFromSelect($(e.target))
    })
    spiHelperGenerateSelect('spiHelper_cuSelect', spiHelperCUTemplates)
    $('#spiHelper_cuSelect', $actionView).on('change', function (e) {
      spiHelperInsertTextFromSelect($(e.target))
    })
    $('#spiHelper_previewLink', $actionView).on('click', function () {
      spiHelperPreviewText()
    })
  } else {
    $('#spiHelper_commentView', $actionView).hide()
  }
  if (spiHelperActionsSelected.Rename) {
    if (spiHelperSectionId) {
      $('#spiHelper_moveHeader', $actionView).text(wgULS('移动章节“', '移動章節「') + spiHelperSectionName + wgULS('”', '」'))
    } else {
      $('#spiHelper_moveHeader', $actionView).text(wgULS('合并整个案件', '合併整個案件'))
    }
  } else {
    $('#spiHelper_moveView', $actionView).hide()
  }
  if (spiHelperActionsSelected.Block || spiHelperActionsSelected.Link) {
    // eslint-disable-next-line no-useless-escape
    const checkuserRegex = /{{\s*(?:checkuser|checkip|CUresult)\s*\|\s*(?:1=)?\s*([^\|}]*?)\s*(?:\|master name\s*=\s*.*)?}}/gi
    const results = pagetext.match(checkuserRegex)
    const likelyusers = []
    const likelyips = []
    const possibleusers = []
    const possibleips = []
    if (results) {
      for (let i = 0; i < results.length; i++) {
        const username = spiHelperNormalizeUsername(results[i].replace(checkuserRegex, '$1'))
        const isIP = mw.util.isIPAddress(username, true)
        if (!isIP && !likelyusers.includes(username)) {
          likelyusers.push(username)
        } else if (isIP && !likelyips.includes(username)) {
          likelyips.push(username)
        }
      }
    }
    const unnamedParameterRegex = /^\s*\d+\s*$/i
    const socklistResults = pagetext.match(/{{\s*sock\s?list\s*([^}]*)}}/gi)
    if (socklistResults) {
      for (let i = 0; i < socklistResults.length; i++) {
        const socklistMatch = socklistResults[i].match(/{{\s*sock\s?list\s*([^}]*)}}/i)[1]
        // First split the text into parts based on the presence of a |
        const socklistArguments = socklistMatch.split('|')
        for (let j = 0; j < socklistArguments.length; j++) {
          // Now try to split based on "=", if wasn't able to it means it's an unnamed argument
          const splitArgument = socklistArguments[j].split('=')
          let username = ''
          if (splitArgument.length === 1) {
            username = spiHelperNormalizeUsername(splitArgument[0])
          } else if (unnamedParameterRegex.test(splitArgument[0])) {
            username = spiHelperNormalizeUsername(splitArgument.slice(1).join('='))
          }
          if (username !== '') {
            const isIP = mw.util.isIPAddress(username, true)
            if (isIP && !likelyips.includes(username)) {
              likelyips.push(username)
            } else if (!isIP && !likelyusers.includes(username)) {
              likelyusers.push(username)
            }
          }
        }
      }
    }
    // eslint-disable-next-line no-useless-escape
    const userRegex = /{{\s*(?:user|vandal|IP|noping|noping2)[^\|}{]*?\s*\|\s*(?:1=)?\s*([^\|}]*?)\s*}}/gi
    const userresults = pagetext.match(userRegex)
    if (userresults) {
      for (let i = 0; i < userresults.length; i++) {
        const username = spiHelperNormalizeUsername(userresults[i].replace(userRegex, '$1'))
        const isIP = mw.util.isIPAddress(username, true)
        if (isIP && !possibleips.includes(username) &&
          !likelyips.includes(username)) {
          possibleips.push(username)
        } else if (!isIP && !possibleusers.includes(username) &&
          !likelyusers.includes(username)) {
          possibleusers.push(username)
        }
      }
    }
    if (spiHelperActionsSelected.Block) {
      if (spiHelperIsAdmin()) {
        $('#spiHelper_blockTagHeader', $actionView).text(wgULS('封禁和标记傀儡', '封鎖和標記傀儡'))
      } else {
        $('#spiHelper_blockTagHeader', $actionView).text(wgULS('标记傀儡', '標記傀儡'))
      }
      // Wire up the "select all" options
      $('#spiHelper_block_doblock', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_acb', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_ab', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_tp', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_email', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_lock', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      $('#spiHelper_block_lock', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      spiHelperGenerateSelect('spiHelper_block_tag', spiHelperTagOptions)
      $('#spiHelper_block_tag', $actionView).on('change', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })
      // spiHelperGenerateSelect('spiHelper_block_tag_altmaster', spiHelperAltMasterTagOptions)
      // $('#spiHelper_block_tag_altmaster', $actionView).on('change', function (e) {
      //   spiHelperSetAllTableColumnOpts($(e.target), 'block')
      // })
      $('#spiHelper_block_lock', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'block')
      })

      for (let i = 0; i < likelyusers.length; i++) {
        spiHelperBlockTableUserCount++
        await spiHelperGenerateBlockTableLine(likelyusers[i], true, spiHelperBlockTableUserCount)
      }
      for (let i = 0; i < likelyips.length; i++) {
        spiHelperBlockTableUserCount++
        await spiHelperGenerateBlockTableLine(likelyips[i], true, spiHelperBlockTableUserCount)
      }
      for (let i = 0; i < possibleusers.length; i++) {
        spiHelperBlockTableUserCount++
        await spiHelperGenerateBlockTableLine(possibleusers[i], false, spiHelperBlockTableUserCount)
      }
      for (let i = 0; i < possibleips.length; i++) {
        spiHelperBlockTableUserCount++
        await spiHelperGenerateBlockTableLine(possibleips[i], false, spiHelperBlockTableUserCount)
      }
    } else {
      $('#spiHelper_blockTagView', $actionView).hide()
    }
    if (spiHelperActionsSelected.Link) {
      // Wire up the "select all" options
      $('#spiHelper_link_editorInteractionAnalyser', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })
      $('#spiHelper_link_interactionTimeline', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })
      $('#spiHelper_link_timecardSPITools', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })
      $('#spiHelper_link_consolidatedTimelineSPITools', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })
      $('#spiHelper_link_pagesSPITools', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })
      $('#spiHelper_link_checkUserWikiSearch', $actionView).on('click', function (e) {
        spiHelperSetAllTableColumnOpts($(e.target), 'link')
      })

      for (let i = 0; i < likelyusers.length; i++) {
        spiHelperLinkTableUserCount++
        await spiHelperGenerateLinksTableLine(likelyusers[i], spiHelperLinkTableUserCount)
      }
      for (let i = 0; i < likelyips.length; i++) {
        spiHelperLinkTableUserCount++
        await spiHelperGenerateLinksTableLine(likelyips[i], spiHelperLinkTableUserCount)
      }
      for (let i = 0; i < possibleusers.length; i++) {
        spiHelperLinkTableUserCount++
        await spiHelperGenerateLinksTableLine(possibleusers[i], spiHelperLinkTableUserCount)
      }
      for (let i = 0; i < possibleips.length; i++) {
        spiHelperLinkTableUserCount++
        await spiHelperGenerateLinksTableLine(possibleips[i], spiHelperLinkTableUserCount)
      }
    } else {
      $('#spiHelper_sockLinksView', $actionView).hide()
    }
  } else {
    $('#spiHelper_blockTagView', $actionView).hide()
    $('#spiHelper_sockLinksView', $actionView).hide()
  }
  // Wire up the submit button
  $('#spiHelper_performActions', $actionView).one('click', () => {
    spiHelperPerformActions()
  })

  updateForRole($actionView)
}

/**
 * Update the view for the roles of the person running the script
 * by selectively hiding.
 * view: @type JQuery object representing the class / id for the view
 */
async function updateForRole (view) {
  // Hide items based on role
  if (!spiHelperIsCheckuser()) {
    // Hide CU options from non-CUs
    $('.spiHelper_cuClass', view).hide()
  }
  if (!spiHelperIsAdmin()) {
    // Hide block options from non-admins
    $('.spiHelper_adminClass', view).hide()
  }
  if (!(spiHelperIsAdmin() || spiHelperIsClerk())) {
    $('.spiHelper_adminClerkClass', view).hide()
  }
}

/**
 * Archives everything on the page that's eligible for archiving
 */
async function spiHelperOneClickArchive () {
  'use strict'
  spiHelperActiveOperations.set('oneClickArchive', 'running')

  const pagetext = await spiHelperGetPageText(spiHelperPageName, false)
  spiHelperCaseSections = await spiHelperGetInvestigationSectionIDs()
  if (!spiHelperSectionRegex.test(pagetext)) {
    alert(wgULS('看起来该页面已经被存档了。', '看起來該頁面已經被存檔了。'))
    spiHelperActiveOperations.set('oneClickArchive', 'successful')
    return
  }
  displayMessage('<ul id="spiHelper_status"/>')
  await spiHelperArchiveCase()
  await spiHelperPurgePage(spiHelperPageName)
  const logMessage = '* [[' + spiHelperPageName + ']]：' + wgULS('使用一键存档器', '使用一鍵存檔器') + '。~~~~~'
  if (spiHelperSettings.log) {
    spiHelperLog(logMessage)
  }
  $('#spiHelper_status', document).append($('<li>').text('完成！'))
  spiHelperActiveOperations.set('oneClickArchive', 'successful')
}

/**
 * Another "meaty" function - goes through the action selections and executes them
 */
async function spiHelperPerformActions () {
  'use strict'
  spiHelperActiveOperations.set('mainActions', 'running')

  // Again, reduce the search scope
  const $actionView = $('#spiHelper_actionViewDiv', document)

  // set up a few function-scoped vars
  let comment = ''
  let blockSummaryNoLink = false
  let cuBlock = false
  let cuBlockOnly = false
  let newCaseStatus = 'noaction'
  let renameTarget = ''
  let renameAddOldName = false

  /** @type {boolean} */
  const blankTalk = $('#spiHelper_blanktalk', $actionView).prop('checked')
  /** @type {boolean} */
  const overrideExisting = $('#spiHelper_override', $actionView).prop('checked')
  /** @type {boolean} */
  const hideLockNames = $('#spiHelper_hidelocknames', $actionView).prop('checked')

  if (spiHelperActionsSelected.Case_act) {
    newCaseStatus = $('#spiHelper_CaseAction', $actionView).val().toString()
  }
  if (spiHelperActionsSelected.SpiMgmt) {
    spiHelperArchiveNoticeParams.deny = $('#spiHelper_spiMgmt_deny', $actionView).prop('checked')
    spiHelperArchiveNoticeParams.xwiki = $('#spiHelper_spiMgmt_crosswiki', $actionView).prop('checked')
    spiHelperArchiveNoticeParams.notalk = $('#spiHelper_spiMgmt_notalk', $actionView).prop('checked')
    spiHelperArchiveNoticeParams.lta = $('#spiHelper_spiMgmt_lta', $actionView).val().toString().trim()
  }
  if (spiHelperSectionId && !spiHelperIsThisPageAnArchive) {
    comment = $('#spiHelper_CommentText', $actionView).val().toString().trim()
  }
  if (spiHelperActionsSelected.Block) {
    if (spiHelperIsCheckuser()) {
      cuBlock = $('#spiHelper_cublock', $actionView).prop('checked')
      cuBlockOnly = $('#spiHelper_cublockonly', $actionView).prop('checked')
    }
    blockSummaryNoLink = $('#spiHelper_blockSummaryNoLink', $actionView).prop('checked')
    if (spiHelperIsAdmin() && !$('#spiHelper_noblock', $actionView).prop('checked')) {
      const masterNotice = $('#spiHelper_blocknoticemaster', $actionView).prop('checked')
      const sockNotice = $('#spiHelper_blocknoticesocks', $actionView).prop('checked')
      for (let i = 1; i <= spiHelperBlockTableUserCount; i++) {
        if ($('#spiHelper_block_doblock' + i, $actionView).prop('checked')) {
          if (!$('#spiHelper_block_username' + i, $actionView).val().toString()) {
            // Skip blank usernames, empty string is falsey
            continue
          }
          let noticetype = ''

          const username = spiHelperNormalizeUsername($('#spiHelper_block_username' + i, $actionView).val().toString())

          if (masterNotice && ($('#spiHelper_block_tag' + i, $actionView).val().toString().includes('master') ||
                spiHelperNormalizeUsername(spiHelperCaseName) === username)) {
            noticetype = 'master'
          } else if (sockNotice) {
            noticetype = 'sock'
          }

          /** @type {BlockEntry} */
          const item = {
            username: username,
            duration: $('#spiHelper_block_duration' + i, $actionView).val().toString(),
            acb: $('#spiHelper_block_acb' + i, $actionView).prop('checked'),
            ab: $('#spiHelper_block_ab' + i, $actionView).prop('checked'),
            ntp: $('#spiHelper_block_tp' + i, $actionView).prop('checked'),
            nem: $('#spiHelper_block_email' + i, $actionView).prop('checked'),
            tpn: noticetype
          }
          spiHelperBlocks.push(item)
        }
        if ($('#spiHelper_block_lock' + i, $actionView).prop('checked')) {
          spiHelperGlobalLocks.push($('#spiHelper_block_username' + i, $actionView).val().toString())
        }
        if ($('#spiHelper_block_tag' + i).val() !== '') {
          if (!$('#spiHelper_block_username' + i, $actionView).val().toString()) {
            // Skip blank entries
            continue
          }
          const item = {
            username: spiHelperNormalizeUsername($('#spiHelper_block_username' + i, $actionView).val().toString()),
            tag: $('#spiHelper_block_tag' + i, $actionView).val().toString(),
            altmasterTag: '', // $('#spiHelper_block_tag_altmaster' + i, $actionView).val().toString(),
            blocking: $('#spiHelper_block_doblock' + i, $actionView).prop('checked')
          }
          spiHelperTags.push(item)
        }
      }
    } else {
      for (let i = 1; i <= spiHelperBlockTableUserCount; i++) {
        if (!$('#spiHelper_block_username' + i, $actionView).val().toString()) {
          // Skip blank entries
          continue
        }
        if ($('#spiHelper_block_tag' + i, $actionView).val() !== '') {
          const item = {
            username: spiHelperNormalizeUsername($('#spiHelper_block_username' + i, $actionView).val().toString()),
            tag: $('#spiHelper_block_tag' + i, $actionView).val().toString(),
            altmasterTag: '', // $('#spiHelper_block_tag_altmaster' + i, $actionView).val().toString(),
            blocking: false
          }
          spiHelperTags.push(item)
        }
        if ($('#spiHelper_block_lock' + i, $actionView).prop('checked')) {
          spiHelperGlobalLocks.push(spiHelperNormalizeUsername($('#spiHelper_block_username' + i, $actionView).val().toString()))
        }
      }
    }
  }
  if (spiHelperActionsSelected.Close) {
    spiHelperActionsSelected.Close = $('#spiHelper_CloseCase', $actionView).prop('checked')
  }
  if (spiHelperActionsSelected.Rename) {
    renameTarget = spiHelperNormalizeUsername($('#spiHelper_moveTarget', $actionView).val().toString())
    renameAddOldName = $('#spiHelper_AddOldName', $actionView).prop('checked')
  }
  if (spiHelperActionsSelected.Archive) {
    spiHelperActionsSelected.Archive = $('#spiHelper_ArchiveCase', $actionView).prop('checked')
  }

  displayMessage('<div id="linkViewResults" hidden><h4>' + wgULS('产生的链接', '產生的連結') + '</h4><ul id="linkViewResultsList"></ul></div><h4>' + wgULS('正在执行的操作', '正在執行的操作') + '</h4><ul id="spiHelper_status" />')

  const $statusAnchor = $('#spiHelper_status', document)

  let sectionText = await spiHelperGetPageText(spiHelperPageName, true, spiHelperSectionId)
  let editsummary = ''
  let logMessage = '* [[' + spiHelperPageName + ']]'
  if (spiHelperSectionId) {
    logMessage += wgULS('（章节', '（章節') + spiHelperSectionName + '）'
  } else {
    logMessage += wgULS('（所有章节）', '（所有章節）')
  }
  logMessage += '~~~~~'

  if (spiHelperActionsSelected.Link) {
    $('#linkViewResults', document).show()
    const spiHelperUsersForLinks = {
      editorInteractionAnalyser: [],
      interactionTimeline: [],
      timecardSPITools: [],
      consolidatedTimelineSPITools: [],
      pagesSPITools: [],
      checkUserWikiSearch: []
    }
    for (let i = 1; i <= spiHelperLinkTableUserCount; i++) {
      const username = $('#spiHelper_link_username' + i, $actionView).val().toString()
      if (!username) {
        // Skip blank usernames
        continue
      }
      if ($('#spiHelper_link_editorInteractionAnalyser' + i, $actionView).prop('checked')) spiHelperUsersForLinks.editorInteractionAnalyser.push(username)
      if ($('#spiHelper_link_interactionTimeline' + i, $actionView).prop('checked')) spiHelperUsersForLinks.interactionTimeline.push(username)
      if ($('#spiHelper_link_timecardSPITools' + i, $actionView).prop('checked')) spiHelperUsersForLinks.timecardSPITools.push(username)
      if ($('#spiHelper_link_consolidatedTimelineSPITools' + i, $actionView).prop('checked')) spiHelperUsersForLinks.consolidatedTimelineSPITools.push(username)
      if ($('#spiHelper_link_pagesSPITools' + i, $actionView).prop('checked')) spiHelperUsersForLinks.pagesSPITools.push(username)
      if ($('#spiHelper_link_checkUserWikiSearch' + i, $actionView).prop('checked')) spiHelperUsersForLinks.checkUserWikiSearch.push(username)
    }

    const $linkViewList = $('#linkViewResultsList', document)
    for (const link in spiHelperUsersForLinks) {
      if (spiHelperUsersForLinks[link].length === 0) continue
      const URLentry = spiHelperLinkViewURLFormats[link]
      let generatedURL = URLentry.baseurl + '?' + (URLentry.multipleUserQueryStringKeys ? '' : URLentry.userQueryStringKey + '=')
      for (let i = 0; i < spiHelperUsersForLinks[link].length; i++) {
        const username = spiHelperUsersForLinks[link][i]
        generatedURL += (i === 0 ? '' : URLentry.userQueryStringSeparator)
        if (URLentry.multipleUserQueryStringKeys) {
          generatedURL += URLentry.userQueryStringKey + '=' + URLentry.userQueryStringWrapper + encodeURIComponent(username) + URLentry.userQueryStringWrapper
        } else {
          generatedURL += URLentry.userQueryStringWrapper + encodeURIComponent(username) + URLentry.userQueryStringWrapper
        }
      }
      generatedURL += (URLentry.appendToQueryString === '' ? '' : '&') + URLentry.appendToQueryString
      const $statusLine = $('<li>').appendTo($linkViewList)
      const $statusLineLink = $('<a>').appendTo($statusLine)
      $statusLineLink.attr('href', generatedURL).attr('target', '_blank').attr('rel', 'noopener noreferrer').text(spiHelperLinkViewURLFormats[link].name)
    }
  }

  if (spiHelperSectionId !== null && !spiHelperIsThisPageAnArchive) {
    let caseStatusResult = spiHelperCaseStatusRegex.exec(sectionText)
    if (caseStatusResult === null) {
      sectionText = sectionText.replace(/^(\s*===.*===[^\S\r\n]*)/, '$1\n{{SPI case status|}}')
      caseStatusResult = spiHelperCaseStatusRegex.exec(sectionText)
    }
    const oldCaseStatus = caseStatusResult[1] || 'open'
    if (newCaseStatus === 'noaction') {
      newCaseStatus = oldCaseStatus
    }

    if (spiHelperActionsSelected.Case_act && newCaseStatus !== 'noaction') {
      switch (newCaseStatus) {
        case 'reopen':
          newCaseStatus = 'open'
          editsummary = wgULS('重开', '重開')
          break
        case 'open':
          editsummary = wgULS('待处理', '待處理')
          break
        case 'CUrequest':
          editsummary = wgULS('请求查核', '請求查核')
          break
        case 'admin':
          editsummary = wgULS('请求管理员协助', '請求管理員協助')
          break
        case 'clerk':
          editsummary = wgULS('请求助理协助', '請求助理協助')
          break
        case 'selfendorse':
          newCaseStatus = 'endorse'
          editsummary = wgULS('请求查核并自我批准', '請求查核並自我批准')
          break
        case 'checked':
          editsummary = '完成查核'
          break
        case 'inprogress':
          editsummary = wgULS('处理中', '處理中')
          break
        case 'decline':
          editsummary = wgULS('拒绝查核', '拒絕查核')
          break
        case 'cudecline':
          editsummary = wgULS('查核员拒绝进行查核', '查核員拒絕進行查核')
          break
        case 'endorse':
          editsummary = '批准查核'
          break
        case 'cuendorse':
          editsummary = wgULS('查核员批准查核', '查核員批准查核')
          break
        case 'moreinfo': // Intentional fallthrough
        case 'cumoreinfo':
          editsummary = wgULS('需要更多信息', '需要更多資訊')
          break
        case 'relist':
          editsummary = '重新提出查核'
          break
        case 'hold':
          editsummary = wgULS('搁置', '擱置')
          break
        case 'cuhold':
          editsummary = wgULS('查核员搁置', '查核員擱置')
          break
        case 'noaction':
          // Do nothing
          break
        default:
          console.error(wgULS('未预期的案件状态值：', '未預期的案件狀態值：') + newCaseStatus)
      }
      logMessage += '\n** ' + wgULS('将案件状态从', '將案件狀態從') + oldCaseStatus + wgULS('改为', '改為') + newCaseStatus
    }
  }

  if (spiHelperActionsSelected.SpiMgmt) {
    const newArchiveNotice = spiHelperMakeNewArchiveNotice(spiHelperCaseName, spiHelperArchiveNoticeParams)
    sectionText = sectionText.replace(spiHelperArchiveNoticeRegex, newArchiveNotice)
    if (editsummary) {
      editsummary += wgULS('，更新存档通知', '，更新存檔通知')
    } else {
      editsummary = wgULS('更新存档通知', '更新存檔通知')
    }
    logMessage += '\n** ' + wgULS('已更新存档通知', '已更新存檔通知')
  }

  if (spiHelperActionsSelected.Block) {
    let sockmaster = ''
    let altmaster = ''
    let needsAltmaster = false
    spiHelperTags.forEach(async (tagEntry) => {
      // we do not support tagging IPs
      if (mw.util.isIPAddress(tagEntry.username, true)) {
        // Skip, this is an IP
        return
      }
      if (tagEntry.tag.includes('master')) {
        sockmaster = tagEntry.username
      }
      if (tagEntry.altmasterTag !== '') {
        needsAltmaster = true
      }
    })
    if (sockmaster === '') {
      sockmaster = prompt(wgULS('请输入主账户名称：', '請輸入主帳號名稱：'), spiHelperCaseName) || spiHelperCaseName
    }
    if (needsAltmaster) {
      altmaster = prompt(wgULS('请输入替代的主账户名称：', '請輸入替代的主帳號名稱：'), spiHelperCaseName) || spiHelperCaseName
    }

    let blockedList = ''
    if (spiHelperIsAdmin()) {
      spiHelperBlocks.forEach(async (blockEntry) => {
        const blockReason = await spiHelperGetUserBlockReason(blockEntry.username)
        if (!spiHelperIsCheckuser() && overrideExisting &&
          spiHelperCUBlockRegex.exec(blockReason)) {
          // If you're not a checkuser, we've asked to overwrite existing blocks, and the block
          // target has a CU block on them, check whether that was intended
          if (!confirm(wgULS('用户“', '使用者「') + blockEntry.username + wgULS('”看起来是被CU封禁，您确定要重新封禁他吗？', '」看起來是被CU封鎖，您確定要重新封鎖他嗎？') + '\n' +
            wgULS('当前封禁消息：', '目前封鎖訊息：') + '\n' + blockReason
          )) {
            return
          }
        }
        const isIP = mw.util.isIPAddress(blockEntry.username, true)
        const isIPRange = isIP && !mw.util.isIPAddress(blockEntry.username, false)
        let blockSummary = isIP ? wgULS('滥用[[WP:SOCK|多个IP地址]]', '濫用[[WP:SOCK|多個IP位址]]') : wgULS('滥用[[WP:SOCK|多个账户]]', '濫用[[WP:SOCK|多個帳號]]')
        if (spiHelperIsCheckuser() && cuBlock) {
          const cublockTemplate = isIP ? ('{{checkuserblock}}') : ('{{checkuserblock-account}}')
          if (cuBlockOnly) {
            blockSummary = cublockTemplate
          } else {
            blockSummary = cublockTemplate + '：' + blockSummary
          }
        } else if (isIPRange) {
          blockSummary = '{{Range block}}'
        }
        if (!blockSummaryNoLink) {
          blockSummary += '<!-- ' + wgULS('请参见', '請參見') + '[[' + spiHelperPageName + ']] -->'
        }
        const blockSuccess = await spiHelperBlockUser(
          blockEntry.username,
          blockEntry.duration,
          blockSummary,
          overrideExisting,
          (isIP ? blockEntry.ab : false),
          blockEntry.acb,
          (isIP ? false : blockEntry.ab),
          blockEntry.ntp,
          blockEntry.nem,
          spiHelperSettings.watchBlockedUser,
          spiHelperSettings.watchBlockedUserExpiry)
        if (!blockSuccess) {
          // Don't add a block notice if we failed to block
          if (blockEntry.tpn) {
            // Also warn the user if we were going to post a block notice on their talk page
            const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
            $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('封禁', '封鎖') + blockEntry.username + wgULS('失败，没有发送讨论页通知', '失敗，沒有發送討論頁通知') + '</b>')
          }
          return
        }
        if (blockedList) {
          blockedList += '、'
        }
        blockedList += '{{unping|' + blockEntry.username + '}}'

        if (isIPRange) {
          // There isn't really a talk page for an IP range, so return here before we reach that section
          return
        }
        // Talk page notice
        if (blockEntry.tpn) {
          let newText = ''
          let isSock = blockEntry.tpn.includes('sock')
          // Hacky workaround for when we didn't make a master tag
          if (isSock && blockEntry.username === spiHelperNormalizeUsername(sockmaster)) {
            isSock = false
          }
          if (isSock) {
            newText = '== ' + wgULS('因确认为傀儡而被封禁', '因確認為傀儡而被封鎖') + ' ==\n'
          } else {
            newText = '== ' + wgULS('因滥用傀儡而被封禁', '因濫用傀儡而被封鎖') + ' ==\n'
          }
          newText += '{{subst:uw-sockblock|spi=' + spiHelperCaseName
          if (blockEntry.duration === 'indefinite' || blockEntry.duration === 'infinity') {
            newText += '|indef=yes'
          } else {
            newText += '|duration=' + blockEntry.duration
          }
          if (blockEntry.ntp) {
            newText += '|notalk=yes'
          }
          newText += '|sig=yes'
          if (isSock) {
            newText += '|master=' + sockmaster
          }
          newText += '}}'

          if (!blankTalk) {
            const oldtext = await spiHelperGetPageText('User talk:' + blockEntry.username, true)
            if (oldtext !== '') {
              newText = oldtext + '\n' + newText
            }
          }
          // Hardcode the watch setting to 'nochange' since we will have either watched or not watched based on the _boolean_
          // watchBlockedUser
          spiHelperEditPage('User talk:' + blockEntry.username,
            newText, wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('发送傀儡封禁通知', '發送傀儡封鎖通知'), false, 'nochange')
        }
      })
    }
    if (blockedList) {
      logMessage += '\n** ' + wgULS('已封禁', '已封鎖') + blockedList
    }

    let tagged = ''
    if (sockmaster) {
      // Whether we should purge sock pages (needed when we create a category)
      let needsPurge = false
      // True for each we need to check if the respective category (e.g.
      // "Suspected sockpuppets of Test") exists
      let checkConfirmedCat = false
      let checkSuspectedCat = false
      let checkAltSuspectedCat = false
      let checkAltConfirmedCat = false
      spiHelperTags.forEach(async (tagEntry) => {
        if (mw.util.isIPAddress(tagEntry.username, true)) {
          return // do not support tagging IPs
        }
        const existsGlobally = spiHelperDoesUserExistGlobally(tagEntry.username)
        const existsLocally = spiHelperDoesUserExistLocally(tagEntry.username)
        if (!existsGlobally && !existsLocally) {
          // Skip, don't tag accounts that don't exist
          const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
          $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('账户', '帳號') + tagEntry.username + wgULS('不存在，所以没有进行标记。', '不存在，所以沒有進行標記。') + '</b>')
          return
        }
        if (!($('#spiHelper_tagAccountsWithoutLocalAccount', $actionView).prop('checked')) && existsGlobally && !existsLocally) {
          // Skip as the account does not exist locally but the "tag accounts that exist locally" setting is unchecked.
          return
        }
        let tagText = ''
        let altmasterName = ''
        let altmasterTag = ''
        if (altmaster !== '' && tagEntry.altmasterTag !== '') {
          altmasterName = altmaster
          altmasterTag = tagEntry.altmasterTag
          switch (altmasterTag) {
            case 'suspected':
              checkAltSuspectedCat = true
              break
            case 'proven':
              checkAltConfirmedCat = true
              break
          }
        }
        let isMaster = false
        let tag = ''
        let checked = ''
        switch (tagEntry.tag) {
          case 'blocked':
            tag = 'blocked'
            checkSuspectedCat = true
            break
          case 'proven':
            tag = 'proven'
            checkConfirmedCat = true
            break
          case 'confirmed':
            tag = 'confirmed'
            checkConfirmedCat = true
            break
          case 'master':
            tag = 'blocked'
            isMaster = true
            break
          case 'sockmasterchecked':
            tag = 'blocked'
            checked = 'yes'
            isMaster = true
            break
          case 'bannedmaster':
            tag = 'banned'
            checked = 'yes'
            isMaster = true
            break
          default:
            // Should not be reachable, but since a couple people have
            // reported blank tags, let's add a safety check
            return
        }
        const isLocked = await spiHelperIsUserGloballyLocked(tagEntry.username) ? 'yes' : 'no'
        let isNotBlocked
        // If this account is going to be blocked, force isNotBlocked to 'no' - it's possible that the
        // block hasn't gone through by the time we reach this point
        if (tagEntry.blocking) {
          isNotBlocked = 'no'
        } else if (!existsLocally) {
          // If the user account does not exist locally it cannot be blocked. This check skips the need for the API call to check if the user is blocked
          isNotBlocked = 'yes'
        } else {
          // Otherwise, query whether the user is blocked
          isNotBlocked = await spiHelperGetUserBlockReason(tagEntry.username) ? 'no' : 'yes'
        }
        if (isMaster) {
          // Not doing SPI or LTA fields for now - those auto-detect right now
          // and I'm not sure if setting them to empty would mess that up
          tagText += `{{Sockpuppeteer
| 1 = ${tag}
| checked = ${checked}
}}`
        }
        // Not if-else because we tag something as both sock and master if they're a
        // sockmaster and have a suspected altmaster
        if (!isMaster || altmasterName) {
          let sockmasterName = sockmaster
          if (altmasterName && isMaster) {
            // If we have an altmaster and we're the master, swap a few values around
            sockmasterName = altmasterName
            tag = altmasterTag
            altmasterName = ''
            altmasterTag = ''
            tagText += '\n'
          }
          tagText += `{{Sockpuppet
| 1 = ${sockmasterName}
| 2 = ${tag}
| locked = ${isLocked}
| notblocked = ${isNotBlocked}
}}`
        }
        await spiHelperEditPage('User:' + tagEntry.username, tagText, wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('加入傀儡标记', '加入傀儡標記'),
          false, spiHelperSettings.watchTaggedUser, spiHelperSettings.watchTaggedUserExpiry)
        const summary = wgULS('被永久封禁的用户页', '被永久封鎖的使用者頁面')
        await spiHelperProtectPage('User:' + tagEntry.username, spiBlockedUserpageProtection, summary)
        if (tagged) {
          tagged += '、'
        }
        tagged += '{{unping|' + tagEntry.username + '}}'
      })
      if (tagged) {
        logMessage += '\n** ' + wgULS('已标记', '已標記') + tagged
      }

      if (checkAltConfirmedCat) {
        const catname = 'Category:' + altmaster + '的維基用戶分身'
        const cattext = await spiHelperGetPageText(catname, false)
        // Empty text means the page doesn't exist - create it
        if (!cattext) {
          await spiHelperEditPage(catname, '{{sockpuppet category}}',
            wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('创建傀儡分类', '建立傀儡分類'),
            true, spiHelperSettings.watchNewCats, spiHelperSettings.watchNewCatsExpiry)
          needsPurge = true
        }
      }
      if (checkAltSuspectedCat) {
        const catname = 'Category:' + altmaster + '的維基用戶分身'
        const cattext = await spiHelperGetPageText(catname, false)
        if (!cattext) {
          await spiHelperEditPage(catname, '{{sockpuppet category}}',
            wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('创建傀儡分类', '建立傀儡分類'),
            true, spiHelperSettings.watchNewCats, spiHelperSettings.watchNewCatsExpiry)
          needsPurge = true
        }
      }
      if (checkConfirmedCat) {
        const catname = 'Category:' + sockmaster + '的維基用戶分身'
        const cattext = await spiHelperGetPageText(catname, false)
        if (!cattext) {
          await spiHelperEditPage(catname, '{{sockpuppet category}}',
            wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('创建傀儡分类', '建立傀儡分類'),
            true, spiHelperSettings.watchNewCats, spiHelperSettings.watchNewCatsExpiry)
          needsPurge = true
        }
      }
      if (checkSuspectedCat) {
        const catname = 'Category:' + sockmaster + '的維基用戶分身'
        const cattext = await spiHelperGetPageText(catname, false)
        if (!cattext) {
          await spiHelperEditPage(catname, '{{sockpuppet category}}',
            wgULS('根据', '根據') + '[[' + spiHelperPageName + ']]' + wgULS('创建傀儡分类', '建立傀儡分類'),
            true, spiHelperSettings.watchNewCats, spiHelperSettings.watchNewCatsExpiry)
          needsPurge = true
        }
      }
      // Purge the sock pages if we created a category (to get rid of
      // the issue where the page says "click here to create category"
      // when the category was created after the page)
      if (needsPurge) {
        spiHelperTags.forEach((tagEntry) => {
          if (mw.util.isIPAddress(tagEntry.username, true)) {
            // Skip, this is an IP
            return
          }
          if (!tagEntry.tag && !tagEntry.altmasterTag) {
            // Skip, not tagged
            return
          }
          // Not bothering with an await, no need for async behavior here
          spiHelperPurgePage('User:' + tagEntry.username)
        })
      }
    }
    if (spiHelperGlobalLocks.length > 0) {
      let locked = ''
      let templateContent = ''
      let matchCount = 0
      spiHelperGlobalLocks.forEach(async (globalLockEntry) => {
        // do not support locking IPs (those are global blocks, not
        // locks, and are handled a bit differently)
        if (mw.util.isIPAddress(globalLockEntry, true)) {
          return
        }
        templateContent += '|' + (matchCount + 1) + '=' + globalLockEntry
        if (locked) {
          locked += '、'
        }
        locked += '{{unping|1=' + globalLockEntry + '}}'
        matchCount++
      })

      if (matchCount > 0) {
        if (hideLockNames) {
          // If requested, hide locked names
          templateContent += '|hidename=1'
        }
        // Parts of this code were adapted from https://github.com/Xi-Plus/twinkle-global
        let lockTemplate = ''
        if (matchCount === 1) {
          lockTemplate = '* {{LockHide' + templateContent + '}}'
        } else {
          lockTemplate = '* {{MultiLock' + templateContent + '}}'
        }
        if (!sockmaster) {
          sockmaster = prompt(wgULS('请输入傀儡主账户的名称：', '請輸入傀儡主帳號的名稱：'), spiHelperCaseName) || spiHelperCaseName
        }
        const lockComment = prompt(wgULS('请输入全域锁定请求的留言（可选）：', '請輸入全域鎖定請求的留言（可選）：'), '') || ''
        const heading = hideLockNames ? 'sockpuppet(s)' : '[[Special:CentralAuth/' + sockmaster + '|' + sockmaster + ']] sock(s)'
        let message = '=== Global lock for ' + heading + ' ==='
        message += '\n{{status}}'
        message += '\n' + lockTemplate
        message += '\nSockpuppet(s) found in zhwiki sockpuppet investigation, see [[' + spiHelperInterwikiPrefix + spiHelperPageName + ']]. ' + lockComment + ' --~~~~'

        // Write lock request to [[meta:Steward requests/Global]]
        let srgText = await spiHelperGetPageText('meta:Steward requests/Global', false)
        srgText = srgText.replace(/\n+(== See also == *\n)/, '\n\n' + message + '\n\n$1')
        spiHelperEditPage('meta:Steward requests/Global', srgText, 'global lock request for ' + heading, false, 'nochange')
        $statusAnchor.append($('<li>').text(wgULS('提交全域锁定请求', '提交全域鎖定請求')))
      }
      if (locked) {
        logMessage += '\n** ' + wgULS('请求锁定：', '請求鎖定：') + locked
      }
    }
  }
  if (spiHelperSectionId && comment && comment !== '*' && !spiHelperIsThisPageAnArchive) {
    if (!sectionText.includes('\n----')) {
      sectionText.replace('<!--- 所有留言請放在此行以上。 -->', '')
      sectionText.replace('<!-- 所有留言請放在此行以上。 -->', '')
      sectionText += '\n----<!-- 所有留言請放在此行以上。 -->'
    }
    if (!/~~~~/.test(comment)) {
      comment += '--~~~~'
    }
    // Clerks and admins post in the admin section
    if (spiHelperIsClerk() || spiHelperIsAdmin()) {
      // Complicated regex to find the first regex in the admin section
      // The weird (\n|.) is because we can't use /s (dot matches newline) regex mode without ES9,
      // I don't want to go there yet
      sectionText = sectionText.replace(/\n*----(?!(\n|.)*----)/, '\n' + comment + '\n----')
    } else { // Everyone else posts in the "other users" section
      sectionText = sectionText.replace(spiHelperAdminSectionWithPrecedingNewlinesRegex,
        '\n' + comment + '\n==== 調查助理、監管員、巡檢管理員的意見 ====\n')
    }
    if (editsummary) {
      editsummary += '，留言'
    } else {
      editsummary = '留言'
    }
    logMessage += '\n** 留言'
  }

  if (spiHelperActionsSelected.Close) {
    newCaseStatus = 'close'
    if (editsummary) {
      editsummary += wgULS('，标记案件为关闭', '，標記案件為關閉')
    } else {
      editsummary = wgULS('标记案件为关闭', '標記案件為關閉')
    }
    logMessage += '\n** ' + wgULS('关闭案件', '關閉案件')
  }
  if (spiHelperSectionId !== null && !spiHelperIsThisPageAnArchive) {
    const caseStatusText = spiHelperCaseStatusRegex.exec(sectionText)[0]
    sectionText = sectionText.replace(caseStatusText, '{{SPI case status|' + newCaseStatus + '}}')
  }

  // Fallback: if we somehow managed to not make an edit summary, add a default one
  if (!editsummary) {
    editsummary = wgULS('保存页面', '保存頁面')
  }

  // Make all of the requested edits (synchronous since we might make more changes to the page), unless the page is an archive (as there should be no edits made)
  if (!spiHelperIsThisPageAnArchive) {
    const editResult = await spiHelperEditPage(spiHelperPageName, sectionText, editsummary, false,
      spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry, spiHelperStartingRevID, spiHelperSectionId)
    if (!editResult) {
      // Page edit failed (probably an edit conflict), dump the comment if we had one
      if (comment && comment !== '*') {
        $('<li>')
          .append($('<div>').addClass('spihelper-errortext')
            .append($('<b>').text(wgULS('SPI页面编辑失败！留言是：', 'SPI頁面編輯失敗！留言是：') + comment)))
          .appendTo($('#spiHelper_status', document))
      }
    }
  }
  // Update to the latest revision ID
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
  if (spiHelperActionsSelected.Archive) {
    // Archive the case
    if (spiHelperSectionId === null) {
      // Archive the whole case
      logMessage += '\n** ' + wgULS('存档案件', '存檔案件')
      await spiHelperArchiveCase()
    } else {
      // Just archive the selected section
      logMessage += '\n** ' + wgULS('存档章节', '存檔章節')
      await spiHelperArchiveCaseSection(spiHelperSectionId)
    }
  } else if (spiHelperActionsSelected.Rename && renameTarget) {
    if (spiHelperSectionId === null) {
      // Option 1: we selected "All cases," this is a whole-case move/merge
      logMessage += '\n** ' + wgULS('移动/合并案件到', '移動/合併案件到') + renameTarget
      await spiHelperMoveCase(renameTarget, renameAddOldName)
    } else {
      // Option 2: this is a single-section case move or merge
      logMessage += '\n** ' + wgULS('移动章节到', '移動章節到') + renameTarget
      await spiHelperMoveCaseSection(renameTarget, spiHelperSectionId, renameAddOldName)
    }
  }
  if (spiHelperSettings.log) {
    spiHelperLog(logMessage)
  }

  await spiHelperPurgePage(spiHelperPageName)
  $('#spiHelper_status', document).append($('<li>').text('完成！'))
  spiHelperActiveOperations.set('mainActions', 'successful')
}

/**
 * Logs SPI actions to userspace a la Twinkle's CSD/prod/etc. logs
 *
 * @param {string} logString String with the changes the user made
 */
async function spiHelperLog (logString) {
  const now = new Date()
  const dateString = now.toLocaleString('zh', { year: 'numeric' }) + now.toLocaleString('zh', { month: 'short' })
  const dateHeader = '==\\s*' + dateString + '\\s*=='
  const dateHeaderRe = new RegExp(dateHeader, 'i')
  const dateHeaderReWithAnyDate = /==.*?==/i

  let logPageText = await spiHelperGetPageText('User:' + mw.config.get('wgUserName') + '/spihelper_log', false)
  if (!logPageText.match(dateHeaderRe)) {
    if (spiHelperSettings.reversed_log) {
      const firstHeaderMatch = logPageText.match(dateHeaderReWithAnyDate)
      logPageText = logPageText.substring(0, firstHeaderMatch.index) + '== ' + dateString + ' ==\n' + logPageText.substring(firstHeaderMatch.index)
    } else {
      logPageText += '\n== ' + dateString + ' =='
    }
  }
  if (spiHelperSettings.reversed_log) {
    const firstHeaderMatch = logPageText.match(dateHeaderReWithAnyDate)
    logPageText = logPageText.substring(0, firstHeaderMatch.index + firstHeaderMatch[0].length) + '\n' + logString + logPageText.substring(firstHeaderMatch.index + firstHeaderMatch[0].length)
  } else {
    logPageText += '\n' + logString
  }
  await spiHelperEditPage('User:' + mw.config.get('wgUserName') + '/spihelper_log', logPageText, wgULS('记录spihelper的编辑', '記錄spihelper的編輯'), false, 'nochange')
}

// Major helper functions
/**
 * Cleanups following a rename - update the archive notice, add an archive notice to the
 * old case name, add the original sockmaster to the sock list for reference
 *
 * @param {string} oldCasePage Title of the previous case page
 * @param {boolean} addOldName Whether to add old case name
 */
async function spiHelperPostRenameCleanup (oldCasePage, addOldName) {
  'use strict'
  const replacementArchiveNotice = '<noinclude>__TOC__</noinclude>\n' + spiHelperMakeNewArchiveNotice(spiHelperCaseName, spiHelperArchiveNoticeParams) + '\n{{SPIpriorcases}}'
  const oldCaseName = oldCasePage.replace(/Wikipedia:傀儡調查\/案件\//g, '')

  // Update previous SPI redirects to this location
  const pagesChecked = []
  const pagesToCheck = [oldCasePage]
  let currentPageToCheck = null
  while (pagesToCheck.length !== 0) {
    currentPageToCheck = pagesToCheck.pop()
    pagesChecked.push(currentPageToCheck)
    const backlinks = await spiHelperGetSPIBacklinks(currentPageToCheck)
    for (let i = 0; i < backlinks.length; i++) {
      if ((await spiHelperParseArchiveNotice(backlinks[i].title)).username === currentPageToCheck.replace(/Wikipedia:傀儡調查\/案件\//g, '')) {
        spiHelperEditPage(backlinks[i].title, replacementArchiveNotice, wgULS('跟随页面移动案件', '跟隨頁面移動案件'), false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry)
        if (pagesChecked.indexOf(backlinks[i]).title !== -1) {
          pagesToCheck.push(backlinks[i])
        }
      }
    }
  }

  // The old case should just be the archivenotice template and point to the new case
  spiHelperEditPage(oldCasePage, replacementArchiveNotice, wgULS('跟随页面移动案件', '跟隨頁面移動案件'), false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry)

  // The new case's archivenotice should be updated with the new name
  let newPageText = await spiHelperGetPageText(spiHelperPageName, true)
  newPageText = newPageText.replace(spiHelperArchiveNoticeRegex, '{{SPI archive notice|1=' + spiHelperCaseName + '$2}}')
  // We also want to add the previous master to the sock list
  // We use SOCK_SECTION_RE_WITH_NEWLINE to clean up any extraneous whitespace
  if (addOldName) {
    newPageText = newPageText.replace(spiHelperSockSectionWithNewlineRegex, '==== 疑似傀儡 ====' +
    '\n* {{checkuser|1=' + oldCaseName + '|bullet=no}}（{{clerknote}}：' + wgULS('原始案件名称', '原始案件名稱') + '）\n')
  }
  // Also remove the new master if they're in the sock list
  // This RE is kind of ugly. The idea is that we find everything from the level 4 heading
  // ending with "sockpuppets" to the level 4 heading beginning with <big> and pull the checkuser
  // template matching the current case name out. This keeps us from accidentally replacing a
  // checkuser entry in the admin section
  const newMasterReString = '(傀儡\\s*====.*?)\\n^\\s*\\*\\s*{{checkuser\\|(?:1=)?' + spiHelperCaseName + '(?:\\|master name\\s*=.*?)?}}\\s*$(.*====\\s*<big>)'
  const newMasterRe = new RegExp(newMasterReString, 'sm')
  newPageText = newPageText.replace(newMasterRe, '$1\n$2')

  await spiHelperEditPage(spiHelperPageName, newPageText, wgULS('跟随页面移动案件', '跟隨頁面移動案件'), false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry, spiHelperStartingRevID)
  // Update to the latest revision ID
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
}

/**
 * Cleanups following a merge - re-insert the original page text
 *
 * @param {string} oldCasePage Title of the previous case page
 * @param {string} originalText Text of the page pre-merge
 * @param {boolean} addOldName Whether to add old case name
 */
async function spiHelperPostMergeCleanup (oldCasePage, originalText, addOldName) {
  'use strict'
  const oldCaseName = oldCasePage.replace(/Wikipedia:傀儡調查\/案件\//g, '')

  let newText = await spiHelperGetPageText(spiHelperPageName, false)
  // Remove the SPI header templates from the page
  originalText = originalText.replace(/\n*<noinclude>__TOC__.*\n/ig, '')
  originalText = originalText.replace(spiHelperArchiveNoticeRegex, '')
  originalText = originalText.replace(spiHelperPriorCasesRegex, '')
  if (addOldName) {
    originalText = originalText.replace(spiHelperSockSectionWithNewlineRegex, '==== 疑似傀儡 ====' +
    '\n* {{checkuser|1=' + oldCaseName + '|bullet=no}}（{{clerknote}}：' + wgULS('原始案件名称', '原始案件名稱') + '）\n')
  }
  newText += '\n' + originalText

  // Write the updated case
  await spiHelperEditPage(spiHelperPageName, newText, wgULS('合并案件', '合併案件'), false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry, spiHelperStartingRevID)
  // Update to the latest revision ID
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
}

/**
 * Archive all closed sections of a case
 */
async function spiHelperArchiveCase () {
  'use strict'
  let i = 0
  let previousRev = 0
  while (i < spiHelperCaseSections.length) {
    const sectionId = spiHelperCaseSections[i].index
    const sectionText = await spiHelperGetPageText(spiHelperPageName, false,
      sectionId)

    const currentRev = await spiHelperGetPageRev(spiHelperPageName)
    if (previousRev === currentRev && currentRev !== 0) {
      // Our previous archive hasn't gone through yet, wait a bit and retry
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })

      // Re-grab the case sections list since the page may have updated
      spiHelperCaseSections = await spiHelperGetInvestigationSectionIDs()
      continue
    }
    previousRev = await spiHelperGetPageRev(spiHelperPageName)
    i++
    const result = spiHelperCaseStatusRegex.exec(sectionText)
    if (result === null) {
      // Bail out - can't find the case status template in this section
      continue
    }
    if (spiHelperCaseClosedRegex.test(result[1])) {
      // A running concern with the SPI archives is whether they exceed the post-expand
      // include size. Calculate what percent of that size the archive will be if we
      // add the current page to it - if >1, we need to archive the archive
      const postExpandPercent =
        (await spiHelperGetPostExpandSize(spiHelperPageName, sectionId) +
        await spiHelperGetPostExpandSize(spiHelperGetArchiveName())) /
        spiHelperGetMaxPostExpandSize()
      if (postExpandPercent >= 1) {
        // We'd overflow the archive, so move it and then archive the current page
        // Find the first empty archive page
        let archiveId = 1
        while (await spiHelperGetPageText(spiHelperGetArchiveName() + '/' + archiveId, false) !== '') {
          archiveId++
        }
        const newArchiveName = spiHelperGetArchiveName() + '/' + archiveId
        await spiHelperMovePage(spiHelperGetArchiveName(), newArchiveName, wgULS('移动存档以避免超过post expand size limit', '移動存檔以避免超過post expand size limit'), false)
        await spiHelperEditPage(spiHelperGetArchiveName(), '', wgULS('移除重定向', '移除重新導向'), false, 'nochange')
      }
      // Need an await here - if we have multiple sections archiving we don't want
      // to stomp on each other
      await spiHelperArchiveCaseSection(sectionId)
      // need to re-fetch caseSections since the section numbering probably just changed,
      // also reset our index
      i = 0
      spiHelperCaseSections = await spiHelperGetInvestigationSectionIDs()
    }
  }
}

/**
 * Archive a specific section of a case
 *
 * @param {!number} sectionId The section number to archive
 */
async function spiHelperArchiveCaseSection (sectionId) {
  'use strict'
  let sectionText = await spiHelperGetPageText(spiHelperPageName, true, sectionId)
  sectionText = sectionText.replace(spiHelperCaseStatusRegex, '')
  const newarchivetext = sectionText.substring(sectionText.search(spiHelperSectionRegex))

  // Update the archive
  let archivetext = await spiHelperGetPageText(spiHelperGetArchiveName(), true)
  if (!archivetext) {
    archivetext = '__TOC__\n{{SPI archive notice|1=' + spiHelperCaseName + '}}\n{{SPIpriorcases}}'
  } else {
    archivetext = archivetext.replace(/<br\s*\/>\s*{{SPIpriorcases}}/gi, '\n{{SPIpriorcases}}') // fmt fix whenever needed.
  }
  archivetext += '\n' + newarchivetext
  const archiveSuccess = await spiHelperEditPage(spiHelperGetArchiveName(), archivetext,
    wgULS('从', '從') + '[[' + spiHelperPageName + ']]' + wgULS('存档案件章节', '存檔案件章節'),
    false, spiHelperSettings.watchArchive, spiHelperSettings.watchArchiveExpiry)

  if (!archiveSuccess) {
    const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
    $statusLine.addClass('spihelper-errortext').append('b').text(wgULS('无法更新存档，未从案件页面中删除章节', '無法更新存檔，未從案件頁面中刪除章節'))
    return
  }

  // Blank the section we archived
  await spiHelperEditPage(spiHelperPageName, '', wgULS('存档案件章节到', '存檔案件章節到') + '[[' + spiHelperGetArchiveName() + ']]',
    false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry, spiHelperStartingRevID, sectionId)
  // Update to the latest revision ID
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
}

/**
 * Move or merge the selected case into a different case
 *
 * @param {string} target The username portion of the case this section should be merged into
 *                        (should have been normalized before getting passed in)
 * @param {boolean} addOldName Whether to add old case name
 */
async function spiHelperMoveCase (target, addOldName) {
  // Move or merge an entire case
  // Normalize: change underscores to spaces
  // target = target
  const newPageName = spiHelperPageName.replace(spiHelperCaseName, target)
  const sourcePageText = await spiHelperGetPageText(spiHelperPageName, false)
  const targetPageText = await spiHelperGetPageText(newPageName, false)

  const oldPageName = spiHelperPageName
  if (newPageName === oldPageName) {
    $('<li>')
      .append($('<div>').addClass('spihelper-errortext')
        .append($('<b>').text(wgULS('目标页面是当前页面，取消合并。', '目標頁面是目前頁面，取消合併。'))))
      .appendTo($('#spiHelper_status', document))
    return
  }
  // Housekeeping to update all of the var names following the rename
  const oldArchiveName = spiHelperGetArchiveName()
  spiHelperCaseName = target
  spiHelperPageName = newPageName
  let archivesCopied = false
  if (targetPageText) {
    // There's already a page there, we're going to merge
    // First, check if there's an archive; if so, copy its text over
    const newArchiveName = spiHelperGetArchiveName().replace(spiHelperCaseName, target)
    let sourceArchiveText = await spiHelperGetPageText(oldArchiveName, false)
    let targetArchiveText = await spiHelperGetPageText(newArchiveName, false)
    if (sourceArchiveText && targetArchiveText) {
      $('<li>')
        .append($('<div>').text(wgULS('来源和目标案件上都侦测到有存档，请手动复制存档。', '來源和目標案件上都偵測到有存檔，請手動複製存檔。')))
        .appendTo($('#spiHelper_status', document))

      // Normalize the source archive text
      sourceArchiveText = sourceArchiveText.replace(/^\s*__TOC__\s*$\n/gm, '')
      sourceArchiveText = sourceArchiveText.replace(spiHelperArchiveNoticeRegex, '')
      sourceArchiveText = sourceArchiveText.replace(spiHelperPriorCasesRegex, '')
      // Strip leading newlines
      sourceArchiveText = sourceArchiveText.replace(/^\n*/, '')
      targetArchiveText += '\n' + sourceArchiveText
      await spiHelperEditPage(newArchiveName, targetArchiveText, wgULS('从', '從') + '[[' + oldArchiveName + ']]' + wgULS('复制存档，参见页面历史', '複製存檔，參見頁面歷史'),
        false, spiHelperSettings.watchArchive, spiHelperSettings.watchArchiveExpiry)
      archivesCopied = true
    }

    if (archivesCopied) {
      // Create a redirect
      spiHelperEditPage(oldArchiveName, '#REDIRECT [[' + newArchiveName + ']]', wgULS('将旧存档重定向到新存档', '將舊存檔重新導向到新存檔'),
        false, spiHelperSettings.watchArchive, spiHelperSettings.watchArchiveExpiry)
    }
  } else {
    await spiHelperMovePage(oldPageName, spiHelperPageName, wgULS('移动案件到', '移動案件到') + '[[' + spiHelperPageName + ']]', false)
  }
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
  if (targetPageText) {
    // If there was a page there before, also need to do post-merge cleanup
    await spiHelperPostRenameCleanup(oldPageName, false)
    await spiHelperPostMergeCleanup(oldPageName, sourcePageText, addOldName)
  } else {
    await spiHelperPostRenameCleanup(oldPageName, addOldName)
  }
  if (archivesCopied) {
    alert(wgULS('存档已在移动案件时被合并，请重新排序存档章节', '存檔已在移動案件時被合併，請重新排序存檔章節'))
  }
}

/**
 * Move or merge a specific section of a case into a different case
 *
 * @param {string} target The username portion of the case this section should be merged into (pre-normalized)
 * @param {!number} sectionId The section ID of this case that should be moved/merged
 */
async function spiHelperMoveCaseSection (target, sectionId, addOldName) {
  // Move or merge a particular section of a case
  'use strict'
  const newPageName = spiHelperPageName.replace(spiHelperCaseName, target)
  let targetPageText = await spiHelperGetPageText(newPageName, false)
  let sectionText = await spiHelperGetPageText(spiHelperPageName, true, sectionId)
  // SOCK_SECTION_RE_WITH_NEWLINE cleans up extraneous whitespace at the top of the section
  // Have to do this transform before concatenating with targetPageText so that the
  // "originally filed" goes in the correct section
  if (addOldName) {
    sectionText = sectionText.replace(spiHelperSockSectionWithNewlineRegex, '==== 疑似傀儡 ====' +
    '\n* {{checkuser|1=' + spiHelperCaseName + '|bullet=no}}（{{clerknote}}：' + wgULS('原始案件名称', '原始案件名稱') + '）\n')
  }

  if (targetPageText === '') {
    // Pre-load the split target with the SPI templates if it's empty
    targetPageText = '<noinclude>__TOC__</noinclude>\n{{SPI archive notice|' + target + '}}\n{{SPIpriorcases}}'
  }
  targetPageText += '\n' + sectionText

  // Intentionally not async - doesn't matter when this edit finishes
  spiHelperEditPage(newPageName, targetPageText, wgULS('移动案件章节自', '移動案件章節自') + '[[' + spiHelperPageName + ']]',
    false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry)
  // Blank the section we moved
  await spiHelperEditPage(spiHelperPageName, '', wgULS('移动案件章节到', '移動案件章節到') + '[[' + newPageName + ']]',
    false, spiHelperSettings.watchCase, spiHelperSettings.watchCaseExpiry, spiHelperStartingRevID, sectionId)
  // Update to the latest revision ID
  spiHelperStartingRevID = await spiHelperGetPageRev(spiHelperPageName)
}

/**
 * Render a text box's contents and display it in the preview area
 *
 */
async function spiHelperPreviewText () {
  const inputText = $('#spiHelper_CommentText', document).val().toString().trim()
  const renderedText = await spiHelperRenderText(spiHelperPageName, inputText)
  // Fill the preview box with the new text
  const $previewBox = $('#spiHelper_previewBox', document)
  $previewBox.html(renderedText)
  // Unhide it if it was hidden
  $previewBox.show()
}

/**
 * Given a page title, get an API to operate on that page
 *
 * @param {string} title Title of the page we want the API for
 * @return {Object} MediaWiki Api/ForeignAPI for the target page's wiki
 */
function spiHelperGetAPI (title) {
  'use strict'
  if (title.startsWith('m:') || title.startsWith('meta:')) {
    // Test on Beta Cluster
    if (mw.config.get('wgServer').includes('beta.wmflabs.org')) {
      return new mw.ForeignApi('https://meta.wikimedia.beta.wmflabs.org/w/api.php')
    } else {
      return new mw.ForeignApi('https://meta.wikimedia.org/w/api.php')
    }
  } else {
    return new mw.Api()
  }
}

/**
 * Removes the interwiki prefix from a page title
 *
 * @param {*} title Page name including interwiki prefix
 * @return {string} Just the page name
 */
function spiHelperStripXWikiPrefix (title) {
  // TODO: This only works with single-colon names, make it more robust
  'use strict'
  if (title.startsWith('m:') || title.startsWith('meta:')) {
    return title.slice(title.indexOf(':') + 1)
  } else {
    return title
  }
}

/**
 * Get the post-expand include size of a given page
 *
 * @param {string} title Page title to check
 * @param {?number} sectionId Section to check, if null check the whole page
 *
 * @return {Promise<number>} Post-expand include size of the given page/page section
 */
async function spiHelperGetPostExpandSize (title, sectionId = null) {
  // Synchronous method to get a page's post-expand include size given its title
  const finalTitle = spiHelperStripXWikiPrefix(title)

  const request = {
    action: 'parse',
    prop: 'limitreportdata',
    page: finalTitle
  }
  if (sectionId) {
    request.section = sectionId
  }
  const api = spiHelperGetAPI(title)
  try {
    const response = await api.get(request)

    // The page might not exist, so we need to handle that smartly - only get the parse
    // if the page actually parsed
    if ('parse' in response) {
      // Iterate over all properties to find the PEIS
      for (let i = 0; i < response.parse.limitreportdata.length; i++) {
        if (response.parse.limitreportdata[i].name === 'limitreport-postexpandincludesize') {
          return response.parse.limitreportdata[i][0]
        }
      }
    } else {
      // Fallback - most likely the page doesn't exist
      return 0
    }
  } catch (error) {
    // Something's gone wrong, just return 0
    return 0
  }
}

/**
 * Get the maximum post-expand size from the wgPageParseReport (it's the same for all pages)
 *
 * @return {number} The max post-expand size in bytes
 */
function spiHelperGetMaxPostExpandSize () {
  'use strict'
  return mw.config.get('wgPageParseReport').limitreport.postexpandincludesize.limit
}

/**
 * Get the inter-wiki prefix for the current wiki
 *
 * @return {string} The inter-wiki prefix
 */
function spiHelperGetInterwikiPrefix () {
  // Mostly copied from https://github.com/Xi-Plus/twinkle-global/blob/master/morebits.js
  // Most of this should be overkill (since most of these wikis don't have checkuser support)
  /** @type {string[]} */ const temp = mw.config.get('wgServer').replace(/^(https?:)?\/\//, '').split('.')
  const wikiLang = temp[0]
  const wikiFamily = temp[1]
  switch (wikiFamily) {
    case 'wikimedia':
      switch (wikiLang) {
        case 'commons':
          return ':commons:'
        case 'meta':
          return ':meta:'
        case 'species:':
          return ':species:'
        case 'incubator':
          return ':incubator:'
        default:
          return ''
      }
    case 'mediawiki':
      return 'mw'
    case 'wikidata:':
      switch (wikiLang) {
        case 'test':
          return ':testwikidata:'
        case 'www':
          return ':d:'
        default:
          return ''
      }
    case 'wikipedia':
      switch (wikiLang) {
        case 'test':
          return ':testwiki:'
        case 'test2':
          return ':test2wiki:'
        default:
          return ':w:' + wikiLang + ':'
      }
    case 'wiktionary':
      return ':wikt:' + wikiLang + ':'
    case 'wikiquote':
      return ':q:' + wikiLang + ':'
    case 'wikibooks':
      return ':b:' + wikiLang + ':'
    case 'wikinews':
      return ':n:' + wikiLang + ':'
    case 'wikisource':
      return ':s:' + wikiLang + ':'
    case 'wikiversity':
      return ':v:' + wikiLang + ':'
    case 'wikivoyage':
      return ':voy:' + wikiLang + ':'
    default:
      return ''
  }
}

// "Building-block" functions to wrap basic API calls
/**
 * Get the text of a page. Not that complicated.
 *
 * @param {string} title Title of the page to get the contents of
 * @param {boolean} show Whether to show page fetch progress on-screen
 * @param {?number} [sectionId=null] Section to retrieve, setting this to null will retrieve the entire page
 *
 * @return {Promise<string>} The text of the page, '' if the page does not exist.
 */
async function spiHelperGetPageText (title, show, sectionId = null) {
  const $statusLine = $('<li>')
  if (show) {
    // Actually display the statusLine
    $('#spiHelper_status', document).append($statusLine)
  }
  // Build the link element (use JQuery so we get escapes and such)
  const $link = $('<a>').attr('href', mw.util.getUrl(title)).attr('title', title).text(title)
  $statusLine.html(wgULS('正在抓取页面', '正在抓取頁面') + $link.prop('outerHTML'))

  const finalTitle = spiHelperStripXWikiPrefix(title)

  const request = {
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    indexpageids: true,
    titles: finalTitle
  }

  if (sectionId) {
    request.rvsection = sectionId
  }

  try {
    const response = await spiHelperGetAPI(title).get(request)
    const pageid = response.query.pageids[0]

    if (pageid === '-1') {
      $statusLine.html(wgULS('页面', '頁面') + $link.html() + '不存在')
      return ''
    }
    $statusLine.html('已抓取' + $link.html())
    return response.query.pages[pageid].revisions[0].slots.main['*']
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('获取', '取得') + $link.html() + wgULS('失败', '失敗') + '</b>：' + error)
    return ''
  }
}

/**
 *
 * @param {string} title Title of the page to edit
 * @param {string} newtext New content of the page
 * @param {string} summary Edit summary to use for the edit
 * @param {boolean} createonly Only try to create the page - if false,
 *                             will fail if the page already exists
 * @param {string} watch What watchlist setting to use when editing - decides
 *                       whether the edited page will be watched
 * @param {string} watchExpiry Duration to watch the edited page, if unset
 *                             defaults to 'indefinite'
 * @param {?number} baseRevId Base revision ID, used to detect edit conflicts. If null,
 *                           we'll grab the current page ID.
 * @param {?number} [sectionId=null] Section to edit - if null, edits the whole page
 *
 * @return {Promise<boolean>} Whether the edit was successful
 */
async function spiHelperEditPage (title, newtext, summary, createonly, watch, watchExpiry = null, baseRevId = null, sectionId = null) {
  let activeOpKey = 'edit_' + title
  if (sectionId) {
    activeOpKey += '_' + sectionId
  }
  spiHelperActiveOperations.set(activeOpKey, 'running')
  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(title)).attr('title', title).text(title)

  $statusLine.html(wgULS('正在编辑', '正在編輯') + $link.prop('outerHTML'))

  if (!baseRevId) {
    baseRevId = await spiHelperGetPageRev(title)
  }
  const api = spiHelperGetAPI(title)
  const finalTitle = spiHelperStripXWikiPrefix(title)

  const request = {
    action: 'edit',
    watchlist: watch,
    summary: summary + spihelperAdvert,
    text: newtext,
    title: finalTitle,
    createonly: createonly,
    baserevid: baseRevId
  }
  if (sectionId) {
    request.section = sectionId
  }
  if (watchExpiry) {
    request.watchlistexpiry = watchExpiry
  }
  try {
    await api.postWithToken('csrf', request)
    $statusLine.html(wgULS('已保存', '已儲存') + $link.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
    return true
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('编辑', '編輯') + $link.html() + wgULS('失败', '失敗') + '</b>：' + error)
    console.error(error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
    return false
  }
}
/**
 * Moves a page. Exactly what it sounds like.
 *
 * @param {string} sourcePage Title of the source page (page we're moving)
 * @param {string} destPage Title of the destination page (page we're moving to)
 * @param {string} summary Edit summary to use for the move
 * @param {boolean} ignoreWarnings Whether to ignore warnings on move (used to force-move one page over another)
 */
async function spiHelperMovePage (sourcePage, destPage, summary, ignoreWarnings) {
  // Move a page from sourcePage to destPage. Not that complicated.
  'use strict'

  const activeOpKey = 'move_' + sourcePage + '_' + destPage
  spiHelperActiveOperations.set(activeOpKey, 'running')

  // Should never be a crosswiki call
  const api = new mw.Api()

  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $sourceLink = $('<a>').attr('href', mw.util.getUrl(sourcePage)).attr('title', sourcePage).text(sourcePage)
  const $destLink = $('<a>').attr('href', mw.util.getUrl(destPage)).attr('title', destPage).text(destPage)

  $statusLine.html(wgULS('正在移动', '正在移動') + $sourceLink.prop('outerHTML') + '到' + $destLink.prop('outerHTML'))

  try {
    await api.postWithToken('csrf', {
      action: 'move',
      from: sourcePage,
      to: destPage,
      reason: summary + spihelperAdvert,
      noredirect: false,
      movesubpages: true,
      ignoreWarnings: ignoreWarnings
    })
    $statusLine.html(wgULS('已移动', '已移動') + $sourceLink.prop('outerHTML') + '到' + $destLink.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('移动', '移動') + $sourceLink.prop('outerHTML') + '到' + $destLink.prop('outerHTML') + wgULS('失败', '失敗') + '</b>：' + error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
  }
}

/**
 * Purges a page's cache
 *
 *
 * @param {string} title Title of the page to purge
 */
async function spiHelperPurgePage (title) {
  // Forces a cache purge on the selected page
  'use strict'
  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(title)).attr('title', title).text(title)
  $statusLine.html('正在清除' + $link.prop('outerHTML') + wgULS('的缓存', '的快取'))
  const strippedTitle = spiHelperStripXWikiPrefix(title)

  const api = spiHelperGetAPI(title)
  try {
    await api.postWithToken('csrf', {
      action: 'purge',
      titles: strippedTitle
    })
    $statusLine.html('已清除' + $link.prop('outerHTML') + wgULS('的缓存', '的快取'))
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>清除' + $link.prop('outerHTML') + wgULS('的缓存失败', '的快取失敗') + '</b>：' + error)
  }
}

/**
 * Blocks a user.
 *
 * @param {string} user Username to block
 * @param {string} duration Duration of the block
 * @param {string} reason Reason to log for the block
 * @param {boolean} reblock Whether to reblock - if false, nothing will happen if the target user is already blocked
 * @param {boolean} anononly For IPs, whether this is an anonymous-only block (alternative is
 *                           that logged-in users with the IP are also blocked)
 * @param {boolean} accountcreation Whether to permit the user to create new accounts
 * @param {boolean} autoblock Whether to apply an autoblock to the user's IP
 * @param {boolean} talkpage Whether to revoke talkpage access
 * @param {boolean} email Whether to block email
 * @param {boolean} watchBlockedUser Watchlist setting for whether to watch the newly-blocked user
 * @param {string} watchExpiry Duration to watch the blocked user, if unset
 *                             defaults to 'indefinite'

 * @return {Promise<boolean>} True if the block suceeded, false if not
 */
async function spiHelperBlockUser (user, duration, reason, reblock, anononly, accountcreation,
  autoblock, talkpage, email, watchBlockedUser, watchExpiry) {
  'use strict'
  const activeOpKey = 'block_' + user
  spiHelperActiveOperations.set(activeOpKey, 'running')

  if (!watchExpiry) {
    watchExpiry = 'indefinite'
  }
  const userPage = 'User:' + user
  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(userPage)).attr('title', userPage).text(user)
  $statusLine.html(wgULS('正在封禁', '正在封鎖') + $link.prop('outerHTML'))

  // This is not something which should ever be cross-wiki
  const api = new mw.Api()
  try {
    await api.postWithToken('csrf', {
      action: 'block',
      expiry: duration,
      reason: reason,
      reblock: reblock,
      anononly: anononly,
      nocreate: accountcreation,
      autoblock: autoblock,
      allowusertalk: !talkpage,
      noemail: email,
      watchuser: watchBlockedUser,
      watchlistexpiry: watchExpiry,
      user: user
    })
    $statusLine.html(wgULS('已封禁', '已封鎖') + $link.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
    return true
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('封禁', '封鎖') + $link.prop('outerHTML') + wgULS('失败', '失敗') + '</b>：' + error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
    return false
  }
}

/**
 * Get whether a user is currently blocked
 *
 * @param {string} user Username
 * @return {Promise<string>} Block reason, empty string if not blocked
 */
async function spiHelperGetUserBlockReason (user) {
  'use strict'
  // This is not something which should ever be cross-wiki
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      list: 'blocks',
      bklimit: '1',
      bkusers: user,
      bkprop: 'user|reason'
    })
    if (response.query.blocks.length === 0) {
      // If the length is 0, then the user isn't blocked
      return ''
    }
    return response.query.blocks[0].reason
  } catch (error) {
    return ''
  }
}

/**
 * Get a user's current block settings
 *
 * @param {string} user Username
 * @return {Promise<BlockEntry>} Current block settings for the user, or null if the user is not blocked
*/
async function spiHelperGetUserBlockSettings (user) {
  'use strict'
  // This is not something which should ever be cross-wiki
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      list: 'blocks',
      bklimit: '1',
      bkusers: user,
      bkprop: 'user|reason|flags|expiry'
    })
    if (response.query.blocks.length === 0) {
      // If the length is 0, then the user isn't blocked
      return null
    }

    /** @type {BlockEntry} */
    const item = {
      username: user,
      duration: response.query.blocks[0].expiry,
      acb: ('nocreate' in response.query.blocks[0] || 'anononly' in response.query.blocks[0]),
      ab: 'autoblock' in response.query.blocks[0],
      ntp: !('allowusertalk' in response.query.blocks[0]),
      nem: 'noemail' in response.query.blocks[0],
      tpn: ''
    }
    return item
  } catch (error) {
    return null
  }
}

/**
 * Get whether a user is currently globally locked
 *
 * @param {string} user Username
 * @return {Promise<boolean>} Whether the user is globally locked
 */
async function spiHelperIsUserGloballyLocked (user) {
  'use strict'
  // This is not something which should ever be cross-wiki
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      list: 'globalallusers',
      agulimit: '1',
      agufrom: user,
      aguto: user,
      aguprop: 'lockinfo'
    })
    if (response.query.globalallusers.length === 0) {
      // If the length is 0, then we couldn't find the global user
      return false
    }
    // If the 'locked' field is present, then the user is locked
    return 'locked' in response.query.globalallusers[0]
  } catch (error) {
    return false
  }
}

async function spiHelperDoesUserExistLocally (user) {
  'use strict'
  // This should never be cross-wiki
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      list: 'allusers',
      agulimit: '1',
      agufrom: user,
      aguto: user
    })
    if (response.query.allusers.length === 0) {
      // If the length is 0, then we couldn't find the local account so return false
      return false
    }
    // Otherwise a local account exists so return true
    return true
  } catch (error) {
    return false
  }
}

async function spiHelperDoesUserExistGlobally (user) {
  'use strict'
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      list: 'globalallusers',
      agulimit: '1',
      agufrom: user,
      aguto: user
    })
    if (response.query.globalallusers.length === 0) {
      // If the length is 0, then we couldn't find the global user so return false
      return false
    }
    // Otherwise the global account exists so return true
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get a page's latest revision ID - useful for preventing edit conflicts
 *
 * @param {string} title Title of the page
 * @return {Promise<number>} Latest revision of a page, 0 if it doesn't exist
 */
async function spiHelperGetPageRev (title) {
  'use strict'

  const finalTitle = spiHelperStripXWikiPrefix(title)
  const request = {
    action: 'query',
    prop: 'revisions',
    rvslots: 'main',
    indexpageids: true,
    titles: finalTitle
  }

  try {
    const response = await spiHelperGetAPI(title).get(request)
    const pageid = response.query.pageids[0]
    if (pageid === '-1') {
      return 0
    }
    return response.query.pages[pageid].revisions[0].revid
  } catch (error) {
    return 0
  }
}

/**
 * Delete a page. Admin-only function.
 *
 * @param {string} title Title of the page to delete
 * @param {string} reason Reason to log for the page deletion
 */
async function spiHelperDeletePage (title, reason) {
  'use strict'

  const activeOpKey = 'delete_' + title
  spiHelperActiveOperations.set(activeOpKey, 'running')

  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(title)).attr('title', title).text(title)
  $statusLine.html(wgULS('删除', '刪除') + $link.prop('outerHTML'))

  const api = spiHelperGetAPI(title)
  try {
    await api.postWithToken('csrf', {
      action: 'delete',
      title: title,
      reason: reason
    })
    $statusLine.html(wgULS('已删除', '已刪除') + $link.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('删除', '刪除') + $link.prop('outerHTML') + wgULS('失败', '失敗') + '</b>：' + error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
  }
}

/**
 * Undelete a page (or, if the page exists, undelete deleted revisions). Admin-only function
 *
 * @param {string} title Title of the pgae to undelete
 * @param {string} reason Reason to log for the page undeletion
 */
async function spiHelperUndeletePage (title, reason) {
  'use strict'
  const activeOpKey = 'undelete_' + title
  spiHelperActiveOperations.set(activeOpKey, 'running')

  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(title)).attr('title', title).text(title)
  $statusLine.html(wgULS('正在还原', '正在還原') + $link.prop('outerHTML'))

  const api = spiHelperGetAPI(title)
  try {
    await api.postWithToken('csrf', {
      action: 'undelete',
      title: title,
      reason: reason
    })
    $statusLine.html(wgULS('已还原', '已還原') + $link.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('还原', '還原') + $link.prop('outerHTML') + wgULS('失败', '失敗') + '</b>：' + error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
  }
}

/**
 * Render a snippet of wikitext
 *
 * @param {string} title Page title
 * @param {string} text Text to render
 * @return {Promise<string>} Rendered version of the text
 */
async function spiHelperRenderText (title, text) {
  'use strict'

  const request = {
    action: 'parse',
    prop: 'text',
    pst: 'true',
    text: text,
    title: title
  }

  try {
    const response = await spiHelperGetAPI(title).get(request)
    return response.parse.text['*']
  } catch (error) {
    console.error(wgULS('渲染文字失败：', '渲染文字失敗：') + error)
    return ''
  }
}

/**
 * Get a list of investigations on the sockpuppet investigation page
 *
 * @return {Promise<Object[]>} An array of section objects, each section is a separate investigation
 */
async function spiHelperGetInvestigationSectionIDs () {
  // Uses the parse API to get page sections, then find the investigation
  // sections (should all be level-3 headers)
  'use strict'

  // Since this only affects the local page, no need to call spiHelper_getAPI()
  const api = new mw.Api()
  const response = await api.get({
    action: 'parse',
    prop: 'sections',
    page: spiHelperPageName
  })
  const dateSections = []
  for (let i = 0; i < response.parse.sections.length; i++) {
    // TODO: also check for presence of spi case status
    if (parseInt(response.parse.sections[i].level) === 3) {
      dateSections.push(response.parse.sections[i])
    }
  }
  return dateSections
}

/**
 * Get SPI page backlinks to this SPI page.
 * Used to fix double redirects when merging cases.
 */
async function spiHelperGetSPIBacklinks (casePageName) {
  // Only looking for enwiki backlinks
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      format: 'json',
      list: 'backlinks',
      bltitle: casePageName,
      blnamespace: '4',
      bldir: 'ascending',
      blfilterredir: 'nonredirects'
    })
    return response.query.backlinks.filter((dictEntry) => {
      return dictEntry.title.startsWith('Wikipedia:傀儡調查/案件/')
    })
  } catch (error) {
    return []
  }
}

/**
 * Get the page protection level for a SPI page.
 * Used to keep the protection level after a history merge
 */
async function spiHelperGetProtectionInformation (casePageName) {
  // Only looking for enwiki protection information
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      format: 'json',
      prop: 'info',
      titles: casePageName,
      inprop: 'protection'
    })
    return response.query.pages[Object.keys(response.query.pages)[0]].protection
  } catch (error) {
    return []
  }
}

/**
 * Gets stabilisation settings information for a page. If no pending changes exists then it returns false.
 */
async function spiHelperGetStabilisationSettings (casePageName) {
  // Only looking for enwiki stabilisation information
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      format: 'json',
      prop: 'flagged',
      titles: casePageName
    })
    const entry = response.query.pages[Object.keys(response.query.pages)[0]]
    if ('flagged' in entry) {
      return entry.flagged
    } else {
      return false
    }
  } catch (error) {
    return false
  }
}

async function spiHelperProtectPage (casePageName, protections, summary) {
  // Only lookint to protect pages on enwiki

  const activeOpKey = 'protect_' + casePageName
  spiHelperActiveOperations.set(activeOpKey, 'running')

  const $statusLine = $('<li>').appendTo($('#spiHelper_status', document))
  const $link = $('<a>').attr('href', mw.util.getUrl(casePageName)).attr('title', casePageName).text(casePageName)
  $statusLine.html(wgULS('正在保护', '正在保護') + $link.prop('outerHTML'))

  const api = new mw.Api()
  try {
    let protectlevelinfo = ''
    let expiryinfo = ''
    protections.forEach((dict) => {
      if (protectlevelinfo !== '') {
        protectlevelinfo = protectlevelinfo + '|'
        expiryinfo = expiryinfo + '|'
      }
      protectlevelinfo = protectlevelinfo + dict.type + '=' + dict.level
      expiryinfo = expiryinfo + dict.expiry
    })
    await api.postWithToken('csrf', {
      action: 'protect',
      format: 'json',
      title: casePageName,
      protections: protectlevelinfo,
      expiry: expiryinfo,
      reason: summary
    })
    $statusLine.html(wgULS('已保护', '已保護') + $link.prop('outerHTML'))
    spiHelperActiveOperations.set(activeOpKey, 'success')
  } catch (error) {
    $statusLine.addClass('spihelper-errortext').html('<b>' + wgULS('保护', '保護') + $link.prop('outerHTML') + wgULS('失败', '失敗') + '</b>：' + error)
    spiHelperActiveOperations.set(activeOpKey, 'failed')
  }
}

async function spiHelperConfigurePendingChanges (casePageName, protectionLevel, protectionExpiry) {
  // Only lookint to protect pages on enwiki

  const activeOpKey = 'stabilize_' + casePageName
  spiHelperActiveOperations.set(activeOpKey, 'running')

  const api = new mw.Api()
  try {
    await api.postWithToken('csrf', {
      action: 'stabilize',
      format: 'json',
      titles: casePageName,
      protectlevel: protectionLevel,
      expiry: protectionExpiry,
      reason: 'Restoring pending changes protection after history merge'
    })
    spiHelperActiveOperations.set(activeOpKey, 'success')
  } catch (error) {
    spiHelperActiveOperations.set(activeOpKey, 'failed')
  }
}

async function spiHelperGetSiteRestrictionInformation () {
  // For enwiki only as this is it's only use case
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'query',
      format: 'json',
      meta: 'siteinfo',
      siprop: 'restrictions'
    })
    return response.query.restrictions
  } catch (error) {
    return []
  }
}

/**
 * Parse given text as wikitext without it needing to be currently saved onwiki.
 *
 */
async function spiHelperParseWikitext (wikitext) {
  // For enwiki only for now
  const api = new mw.Api()
  try {
    const response = await api.get({
      action: 'parse',
      prop: 'text',
      text: wikitext,
      wrapoutputclass: '',
      disablelimitreport: 1,
      disableeditsection: 1,
      contentmodel: 'wikitext'
    })
    return response.parse.text['*']
  } catch (error) {
    return ''
  }
}

/**
 * Returns true if the date provided is a valid date for strtotime in PHP (determined by using the time parser function and a parse API call)
 */
async function spiHelperValidateDate (dateInStringFormat) {
  const response = await spiHelperParseWikitext('{{#time:r|' + dateInStringFormat + '}}')
  return !response.includes('Error: Invalid time.')
}

/**
 * Pretty obvious - gets the name of the archive. This keeps us from having to regen it
 * if we rename the case
 *
 * @return {string} Name of the archive page
 */
function spiHelperGetArchiveName () {
  return spiHelperPageName + '/存檔'
}

// UI helper functions
/**
 * Generate a line of the block table for a particular user
 *
 * @param {string} name Username for this block line
 * @param {boolean} defaultblock Whether to check the block box by default on this row
 * @param {number} id Index of this line in the block table
 */
async function spiHelperGenerateBlockTableLine (name, defaultblock, id) {
  'use strict'

  let currentBlock = null
  if (name) {
    currentBlock = await spiHelperGetUserBlockSettings(name)
  }

  let block, ab, acb, ntp, nem, duration

  if (currentBlock) {
    block = true
    acb = currentBlock.acb
    ab = currentBlock.ab
    ntp = currentBlock.ntp
    nem = currentBlock.nem
    duration = currentBlock.duration
  } else {
    block = defaultblock
    acb = true
    ab = true
    ntp = spiHelperArchiveNoticeParams.notalk
    nem = spiHelperArchiveNoticeParams.notalk
    duration = mw.util.isIPAddress(name, true) ? '1 week' : 'indefinite'
  }

  const $table = $('#spiHelper_blockTable', document)

  const $row = $('<tr>')
  // Username
  $('<td>').append($('<input>').attr('type', 'text').attr('id', 'spiHelper_block_username' + id)
    .val(name).addClass('.spihelper-widthlimit')).appendTo($row)
  // Block checkbox (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_block_doblock' + id).prop('checked', block)).appendTo($row)
  // Block duration (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'text')
    .attr('id', 'spiHelper_block_duration' + id).val(duration)
    .addClass('.spihelper-widthlimit')).appendTo($row)
  // Account creation blocked (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_block_acb' + id).prop('checked', acb)).appendTo($row)
  // Autoblock (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_block_ab' + id).prop('checked', ab)).appendTo($row)
  // Revoke talk page access (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_block_tp' + id).prop('checked', ntp)).appendTo($row)
  // Block email access (only for admins)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_block_email' + id).prop('checked', nem)).appendTo($row)
  // Tag select box
  $('<td>').append($('<select>').attr('id', 'spiHelper_block_tag' + id)
    .val(name)).appendTo($row)
  // Altmaster tag select
  // $('<td>').append($('<select>').attr('id', 'spiHelper_block_tag_altmaster' + id)
  //   .val(name)).appendTo($row)
  // Global lock (disabled for IPs since they can't be locked)
  $('<td>').append($('<input>').attr('type', 'checkbox').attr('id', 'spiHelper_block_lock' + id)
    .prop('disabled', mw.util.isIPAddress(name, true))).appendTo($row)
  $table.append($row)

  // Generate the select entries
  spiHelperGenerateSelect('spiHelper_block_tag' + id, spiHelperTagOptions)
  // spiHelperGenerateSelect('spiHelper_block_tag_altmaster' + id, spiHelperAltMasterTagOptions)
}

async function spiHelperGenerateLinksTableLine (username, id) {
  'use strict'

  const $table = $('#spiHelper_userInfoTable', document)

  const $row = $('<tr>')
  // Username
  $('<td>').append($('<input>').attr('type', 'text').attr('id', 'spiHelper_link_username' + id)
    .val(username).addClass('.spihelper-widthlimit')).appendTo($row)
  // Editor interaction analyser
  $('<td>').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_editorInteractionAnalyser' + id)).attr('style', 'text-align:center;').appendTo($row)
  // Interaction timeline
  $('<td>').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_interactionTimeline' + id)).attr('style', 'text-align:center;').appendTo($row)
  // SPI tools timecard tool
  $('<td>').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_timecardSPITools' + id)).attr('style', 'text-align:center;').appendTo($row)
  // SPI tools consilidated timeline (admin only based on OAUTH requirements)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_consolidatedTimelineSPITools' + id)).attr('style', 'text-align:center;').appendTo($row)
  // SPI tools pages tool (admin only based on OAUTH requirements)
  $('<td>').addClass('spiHelper_adminClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_pagesSPITools' + id)).attr('style', 'text-align:center;').appendTo($row)
  // Checkuser wiki search (CU only)
  $('<td>').addClass('spiHelper_cuClass').append($('<input>').attr('type', 'checkbox')
    .attr('id', 'spiHelper_link_checkUserWikiSearch' + id)).attr('style', 'text-align:center;').appendTo($row)
  $table.append($row)
}

/**
 * Complicated function to decide what checkboxes to enable or disable
 * and which to check by default
 */
async function spiHelperSetCheckboxesBySection () {
  // Displays the top-level SPI menu
  'use strict'

  const $topView = $('#spiHelper_topViewDiv', document)
  // Get the value of the selection box
  if ($('#spiHelper_sectionSelect', $topView).val() === 'all') {
    spiHelperSectionId = null
    spiHelperSectionName = null
  } else {
    spiHelperSectionId = parseInt($('#spiHelper_sectionSelect', $topView).val().toString())
    const $sectionSelect = $('#spiHelper_sectionSelect', $topView)
    spiHelperSectionName = spiHelperCaseSections[$sectionSelect.prop('selectedIndex')].line
  }

  const $warningText = $('#spiHelper_warning', $topView)
  $warningText.hide()

  const $archiveBox = $('#spiHelper_Archive', $topView)
  const $blockBox = $('#spiHelper_BlockTag', $topView)
  const $closeBox = $('#spiHelper_Close', $topView)
  const $commentBox = $('#spiHelper_Comment', $topView)
  const $moveBox = $('#spiHelper_Move', $topView)
  const $caseActionBox = $('#spiHelper_Case_Action', $topView)
  const $spiMgmtBox = $('#spiHelper_SpiMgmt', $topView)

  // Start by unchecking everything
  $archiveBox.prop('checked', false)
  $blockBox.prop('checked', false)
  $closeBox.prop('checked', false)
  $commentBox.prop('checked', false)
  $moveBox.prop('checked', false)
  $caseActionBox.prop('checked', false)
  $spiMgmtBox.prop('checked', false)

  // Enable optionally-disabled boxes
  $closeBox.prop('disabled', false)
  $archiveBox.prop('disabled', false)

  // archivenotice sanity check
  const pageText = await spiHelperGetPageText(spiHelperPageName, false)

  const result = spiHelperArchiveNoticeRegex.exec(pageText)
  if (!result) {
    $warningText.append($('<b>').text(wgULS('找不到存档通知模板！', '找不到存檔通知模板！')))
    $warningText.show()
  }

  if (spiHelperSectionId === null) {
    // Hide inputs that aren't relevant in the case view
    $('.spiHelper_singleCaseOnly', $topView).hide()
    // Show inputs only visible in all-case mode
    $('.spiHelper_allCasesOnly', $topView).show()
    // Fix the move label
    $('#spiHelper_moveLabel', $topView).text(wgULS('合并整个案件（仅限助理）', '合併整個案件（僅限助理）'))
    // enable the move box
    $moveBox.prop('disabled', false)
  } else {
    const sectionText = await spiHelperGetPageText(spiHelperPageName, false, spiHelperSectionId)
    if (!spiHelperSectionRegex.test(sectionText)) {
      // Nothing to do here.
      return
    }

    // Unhide single-case options
    $('.spiHelper_singleCaseOnly', $topView).show()
    // Hide inputs only visible in all-case mode
    $('.spiHelper_allCasesOnly', $topView).hide()

    const result = spiHelperCaseStatusRegex.exec(sectionText)
    let casestatus = ''
    if (result) {
      casestatus = result[1]
    } else if (!spiHelperIsThisPageAnArchive) {
      $warningText.append($('<b>').text(wgULS('无法在', '無法在') + spiHelperSectionName + wgULS('找到案件状态', '找到案件狀態')))
      $warningText.show()
    }

    // Disable the section move setting if you haven't opted into it
    if (!spiHelperSettings.iUnderstandSectionMoves) {
      $moveBox.prop('disabled', true)
    }

    const isClosed = spiHelperCaseClosedRegex.test(casestatus)

    if (isClosed) {
      $closeBox.prop('disabled', true)
      if (spiHelperSettings.tickArchiveWhenCaseClosed) {
        $archiveBox.prop('checked', true)
      }
    } else {
      $archiveBox.prop('disabled', true)
      $('#spiHelper_Case_Action', $topView).on('click', function () {
        $('#spiHelper_Close', $topView).prop('disabled', $('#spiHelper_Case_Action', $topView).prop('checked'))
      })
      $('#spiHelper_Close', $topView).on('click', function () {
        $('#spiHelper_Case_Action', $topView).prop('disabled', $('#spiHelper_Close', $topView).prop('checked'))
      })
    }

    // Change the label on the rename button
    $('#spiHelper_moveLabel', $topView).html(wgULS('移动案件章节（', '移動案件章節（') + '<span title="' + wgULS('你可能想要移动整个案件，', '你可能想要移動整個案件，') +
      wgULS('在下拉菜单选择所有章节而非特定日期', '在下拉式選單選擇所有章節而非特定日期') + '"' +
      'class="rt-commentedText spihelper-hovertext"><b>' + wgULS('请先阅读', '請先閱讀') + '</b></span>）')
  }
  // Only show options suitable for the archive subpage when running on the archives
  if (spiHelperIsThisPageAnArchive) {
    $('.spiHelper_notOnArchive', $topView).hide()
  }
}

/**
 * Updates whether the 'archive' checkbox is enabled
 */
function spiHelperUpdateArchive () {
  // Archive should only be an option if close is checked or disabled (disabled meaning that
  // the case is closed) and rename is not checked
  'use strict'
  $('#spiHelper_Archive', document).prop('disabled', !($('#spiHelper_Close', document).prop('checked') ||
    $('#spiHelper_Close', document).prop('disabled')) || $('#spiHelper_Move', document).prop('checked'))
  if ($('#spiHelper_Archive', document).prop('disabled')) {
    $('#spiHelper_Archive', document).prop('checked', false)
  }
}

/**
 * Updates whether the 'move' checkbox is enabled
 */
function spiHelperUpdateMove () {
  // Rename is mutually exclusive with archive
  'use strict'
  $('#spiHelper_Move', document).prop('disabled', $('#spiHelper_Archive', document).prop('checked'))
  if ($('#spiHelper_Move', document).prop('disabled')) {
    $('#spiHelper_Move', document).prop('checked', false)
  }
}

/**
 * Generate a select input, optionally with an onChange call
 *
 * @param {string} id Name of the input
 * @param {SelectOption[]} options Array of options objects
 */
function spiHelperGenerateSelect (id, options) {
  // Add the dates to the selector
  const $selector = $('#' + id, document)
  for (let i = 0; i < options.length; i++) {
    const o = options[i]
    $('<option>')
      .val(o.value)
      .prop('selected', o.selected)
      .text(o.label)
      .prop('disabled', o.disabled)
      .appendTo($selector)
  }
}

/**
 * Given an HTML element, sets that element's value on all block options
 * For example, checking the 'block all' button will check all per-user 'block' elements
 *
 * @param {JQuery<HTMLElement>} source The HTML input element that we're matching all selections to
 */
function spiHelperSetAllTableColumnOpts (source, forTable) {
  'use strict'
  for (let i = 1; i <= (forTable === 'link' ? spiHelperLinkTableUserCount : spiHelperBlockTableUserCount); i++) {
    const $target = $('#' + source.attr('id') + i)
    if (source.attr('type') === 'checkbox') {
      // Don't try to set disabled checkboxes
      if (!$target.prop('disabled')) {
        $target.prop('checked', source.prop('checked'))
      }
    } else {
      $target.val(source.val())
    }
  }
}

/**
 * Inserts text at the cursor's position
 *
 * @param {JQuery<HTMLElement>} source Select box that was changed
 * @param {number?} pos Position to insert text; if null, inserts at the cursor
 */
function spiHelperInsertTextFromSelect (source, pos = null) {
  const $textBox = $('#spiHelper_CommentText', document)
  // https://stackoverflow.com/questions/11076975/how-to-insert-text-into-the-textarea-at-the-current-cursor-position
  const selectionStart = parseInt($textBox.attr('selectionStart'))
  const selectionEnd = parseInt($textBox.attr('selectionEnd'))
  const startText = $textBox.val().toString()
  const newText = source.val().toString()
  if (pos === null && (selectionStart || selectionStart === 0)) {
    $textBox.val(startText.substring(0, selectionStart) +
      newText +
      startText.substring(selectionEnd, startText.length))
    $textBox.attr('selectionStart', selectionStart + newText.length)
    $textBox.attr('selectionEnd', selectionEnd + newText.length)
  } else if (pos !== null) {
    $textBox.val(startText.substring(0, pos) +
      source.val() +
      startText.substring(pos, startText.length))
    $textBox.attr('selectionStart', selectionStart + newText.length)
    $textBox.attr('selectionEnd', selectionEnd + newText.length)
  } else {
    $textBox.val(startText + newText)
  }

  // Force the selected element to reset its selection to 0
  source.prop('selectedIndex', 0)
}

/**
 * Inserts a {{note}} template at the start of the text box
 *
 * @param {JQuery<HTMLElement>} source Select box that was changed
 */
function spiHelperInsertNote (source) {
  'use strict'
  const $textBox = $('#spiHelper_CommentText', document)
  let newText = $textBox.val().toString().trim()
  // Match the start of the line, optionally including a '*' with or without whitespace around it,
  // optionally including a template which contains the string "note"
  newText = newText.replace(/^(\s*\*\s*)?({{[\w\s]*note[\w\s]*}}\s*：?\s*)?/i, '* {{' + source.val() + '}}：')
  $textBox.val(newText)

  // Force the selected element to reset its selection to 0
  source.prop('selectedIndex', 0)
}

/**
 * Changes the case status in the comment box
 *
 * @param {JQuery<HTMLElement>} source Select box that was changed
 */
function spiHelperCaseActionUpdated (source) {
  const $textBox = $('#spiHelper_CommentText', document)
  let newText = $textBox.val().toString().trim()
  let newTemplate = ''
  switch (source.val()) {
    case 'CUrequest':
      newTemplate = '{{CURequest}}'
      break
    case 'admin':
      newTemplate = '{{awaitingadmin}}'
      break
    case 'clerk':
      newTemplate = '{{Clerk Request}}'
      break
    case 'selfendorse':
      newTemplate = '{{Requestandendorse}}'
      break
    case 'inprogress':
      newTemplate = '{{Inprogress}}'
      break
    case 'decline':
      newTemplate = '{{Clerkdecline}}'
      break
    case 'cudecline':
      newTemplate = '{{Cudecline}}'
      break
    case 'endorse':
      newTemplate = '{{Endorse}}'
      break
    case 'cuendorse':
      newTemplate = '{{cu-endorsed}}'
      break
    case 'moreinfo': // Intentional fallthrough
    case 'cumoreinfo':
      newTemplate = '{{moreinfo}}'
      break
    case 'relist':
      newTemplate = '{{relisted}}'
      break
    case 'hold':
    case 'cuhold':
      newTemplate = '{{onhold}}'
      break
  }
  if (spiHelperClerkStatusRegex.test(newText)) {
    newText = newText.replace(spiHelperClerkStatusRegex, newTemplate)
    if (!newTemplate) { // If the new template is empty, get rid of the stray '：'
      newText = newText.replace(/^(\s*\*\s*)?：/, '$1')
    }
  } else if (newTemplate) {
    // Don't try to insert if the "new template" is empty
    // Also remove the leading *
    newText = '* ' + newTemplate + '：' + newText.replace(/^\s*\*\s*/, '')
  }
  $textBox.val(newText)
}

/**
 * Fires on page load, adds the SPI portlet and (if the page is categorized as "awaiting
 * archive," meaning that at least one closed template is on the page) the SPI-Archive portlet
 */
async function spiHelperAddLink () {
  'use strict'
  await spiHelperLoadSettings()
  await mw.loader.load('mediawiki.util')
  const initLink = mw.util.addPortletLink('p-cactions', '#', wgULS('傀儡调查', '傀儡調查'), 'ca-spiHelper')
  initLink.addEventListener('click', (e) => {
    e.preventDefault()
    return spiHelperInit()
  })
  if (mw.config.get('wgCategories').includes('傀儡調查－等候存檔') && spiHelperIsClerk()) {
    const oneClickArchiveLink = mw.util.addPortletLink('p-cactions', '#', wgULS('傀儡调查-存档', '傀儡調查-存檔'), 'ca-spiHelperArchive')
    $(oneClickArchiveLink).one('click', (e) => {
      e.preventDefault()
      return spiHelperOneClickArchive()
    })
  }
  window.addEventListener('beforeunload', (e) => {
    const $actionView = $('#spiHelper_actionViewDiv', document)
    if ($actionView.length > 0) {
      e.preventDefault()
      // for Chrome
      e.returnValue = ''
      return true
    }

    // Make sure no operations are still in flight
    let isDirty = false
    spiHelperActiveOperations.forEach((value, _0, _1) => {
      if (value === 'running') {
        isDirty = true
      }
    })
    if (isDirty) {
      e.preventDefault()
      e.returnValue = ''
      return true
    }
  })
}

/**
 * Checks for the existence of Special:MyPage/spihelper-options.js, and if it exists,
 * loads the settings from that page.
 */
async function spiHelperLoadSettings () {
  // Dynamically load a user's settings
  // Borrowed from code I wrote for [[User:Headbomb/unreliable.js]]
  try {
    await mw.loader.getScript('/w/index.php?title=Special:MyPage/spihelper-options.js&action=raw&ctype=text/javascript')
    if (typeof spiHelperCustomOpts !== 'undefined') {
      const keys = Object.keys(spiHelperCustomOpts)
      for (let index = 0; index < keys.length; index++) {
        const k = keys[index]
        const v = spiHelperCustomOpts[k]
        if (k in spiHelperValidSettings) {
          if (spiHelperValidSettings[k].indexOf(v) === -1) {
            mw.log.warn('Invalid option given in spihelper-options.js for the setting ' + k.toString())
            return
          }
        } else if (k in spiHelperSettingsNeedingValidDate) {
          if (!await spiHelperValidateDate(v)) {
            mw.log.warn('Invalid option given in spihelper-options.js for the setting ' + k.toString())
            return
          }
        }
        spiHelperSettings[k] = v
      }
    }
  } catch (error) {
    mw.log.error(wgULS('抓取您的spihelper-options.js时发生错误', '抓取您的spihelper-options.js時發生錯誤'))
    // More detailed error in the console
    console.error(wgULS('抓取您的spihelper-options.js时发生错误：', '抓取您的spihelper-options.js時發生錯誤：') + error)
  }
}

// User role helper functions
/**
 * Whether the current user has admin permissions, used to determine
 * whether to show block options
 *
 * @return {boolean} Whether the current user is an admin
 */
function spiHelperIsAdmin () {
  if (spiHelperSettings.debugForceAdminState !== null) {
    return spiHelperSettings.debugForceAdminState
  }
  return mw.config.get('wgUserGroups').includes('sysop')
}

/**
 * Whether the current user has checkuser permissions, used to determine
 * whether to show checkuser options
 *
 * @return {boolean} Whether the current user is a checkuser
 */

function spiHelperIsCheckuser () {
  if (spiHelperSettings.debugForceCheckuserState !== null) {
    return spiHelperSettings.debugForceCheckuserState
  }
  return mw.config.get('wgUserGroups').includes('checkuser') ||
    mw.config.get('wgUserGroups').includes('sysop') || // Allow sysop to perform CU block
    spiHelperSettings.clerk // Allow clerk to use CU functions when there is no local CU
}

/**
 * Whether the current user is a clerk, used to determine whether to show
 * clerk options
 *
 * @return {boolean} Whether the current user is a clerk
 */
function spiHelperIsClerk () {
  // Assumption: checkusers should see clerk options. Please don't prove this wrong.
  return spiHelperSettings.clerk || spiHelperIsCheckuser()
}

/**
 * Common username normalization function
 * @param {string} username Username to normalize
 *
 * @return {string} Normalized username
 */
function spiHelperNormalizeUsername (username) {
  // Replace underscores with spaces
  username = username.replace(/_/g, ' ')
  // Get rid of bad hidden characters
  username = username.replace(spiHelperHiddenCharNormRegex, '')
  // Remove leading and trailing spaces
  username = username.trim()
  if (mw.util.isIPAddress(username, true)) {
    // For IP addresses, capitalize them (really only applies to IPv6)
    username = username.toUpperCase()
  } else {
    // For actual usernames, make sure the first letter is capitalized
    username = username.charAt(0).toUpperCase() + username.slice(1)
  }
  return username
}

/**
 * Parse key features from an archivenotice
 * @param {string} page Page to parse
 *
 * @return {Promise<ParsedArchiveNotice>} Parsed archivenotice
 */
async function spiHelperParseArchiveNotice (page) {
  const pagetext = await spiHelperGetPageText(page, false)
  const match = spiHelperArchiveNoticeRegex.exec(pagetext)
  if (match === null) {
    console.error('Missing archive notice')
    return { username: null, deny: null, xwiki: null, notalk: null, lta: '' }
  }
  const username = match[1]
  let deny = false
  let xwiki = false
  let notalk = false
  let lta = ''
  if (match[2]) {
    for (const entry of match[2].split('|')) {
      if (!entry) {
        // split in such a way that it's just a pipe
        continue
      }
      const splitEntry = entry.split('=')
      if (splitEntry.length !== 2) {
        console.error(wgULS('存档通知参数', '存檔通知參數') + entry + wgULS('格式错误', '格式錯誤'))
        continue
      }
      const key = splitEntry[0]
      const val = splitEntry[1]
      if (key.toLowerCase() === 'deny' && val.toLowerCase() === 'yes') {
        deny = true
      } else if (key.toLowerCase() === 'crosswiki' && val.toLowerCase() === 'yes') {
        xwiki = true
      } else if (key.toLowerCase() === 'notalk' && val.toLowerCase() === 'yes') {
        notalk = true
      } else if (key.toLowerCase() === 'lta') {
        lta = val.trim()
      }
    }
  }
  /** @type {ParsedArchiveNotice} */
  return {
    username: username,
    deny: deny,
    xwiki: xwiki,
    notalk: notalk,
    lta: lta
  }
}

/**
 * Helper function to make a new archivenotice
 * @param {string} username Username
 * @param {ParsedArchiveNotice} archiveNoticeParams Other archivenotice params
 *
 * @return {string} New archivenotice
 */
function spiHelperMakeNewArchiveNotice (username, archiveNoticeParams) {
  let notice = '{{SPI archive notice|1=' + username
  if (archiveNoticeParams.xwiki) {
    notice += '|crosswiki=yes'
  }
  if (archiveNoticeParams.deny) {
    notice += '|deny=yes'
  }
  if (archiveNoticeParams.notalk) {
    notice += '|notalk=yes'
  }
  if (archiveNoticeParams.lta) {
    notice += '|LTA=' + archiveNoticeParams.lta
  }
  notice += '}}'

  return notice
}

/**
 * Function to add a blank user line to the block table
 *
 * Would fail ESlint no-unused-vars due to only being
 * referenced in an onclick event
 *
 * @return {Promise<void>}
 */
// eslint-disable-next-line no-unused-vars
async function spiHelperAddBlankUserLine (tableName) {
  if (tableName === 'block') {
    spiHelperBlockTableUserCount++
    await spiHelperGenerateBlockTableLine('', true, spiHelperBlockTableUserCount)
  } else {
    spiHelperLinkTableUserCount++
    await spiHelperGenerateLinksTableLine('', spiHelperLinkTableUserCount)
  }
  updateForRole()
}

// </nowiki>
