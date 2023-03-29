/**
 * Define Script property Id = your calendar Id
 * Then define trigger to run ProcessInvites in intervals
 */
var doEmail = false;
// Don't accept meetings before this hour. 10 = 10am.
const workStartHour = 10;
// Don't accept meetings that go past this hour. 18 = 6pm.
const workEndHour = 18;
/**
 * Workaround to [Issue 5323](https://code.google.com/p/google-apps-script-issues/issues/detail?id=5323)
 * statusFilters parameter is not working; returns 0 events.
 * @param {string|array} status - GuestStatus or array of GuestStatus to match
 * @returns {function} - Callback parameter to Array.prototype.filter
 */
function statusFilters(status) {
  if (status instanceof Array) {
    return function(invite) {
      return status.includes(invite.getMyStatus());
    }
  } else {
    return function(invite) {
      return invite.getMyStatus() === status;
    }
  }
}

function conflictEventFilters(conflict) {
  var conflictStart = Utilities.formatDate(conflict.getStartTime(), "GMT", "HH:mm");
  var conflictEnd = Utilities.formatDate(conflict.getEndTime(), "GMT", "HH:mm");
  if (conflictStart === "04:00" && conflictEnd === "04:00") {
      return false
  }
  return true
}

function inviteEventFilters(invite) {
  if (invite.getStartTime().getDay() >= 6 || invite.getStartTime().getDay() == 0) {
    return false
  }
  if (invite.getStartTime().getHours() < workStartHour || invite.getStartTime().getHours() > workEndHour) {
    return false
  }
  if (invite.getStartTime().getHours() == workEndHour && invite.getStartTime().getMinutes() > 0) {
    return false
  }
  if (invite.getEndTime().getHours() >= workEndHour) {
    return false
  }
  return true
}

/**
 * Import an HTML template from file
 * @param {string} file - File to import
 * @param {boolean} [template=false] - If true, evaluate imported file as a template
 * @returns {HtmlOutput} Inline, rendered content
 */
function importTemplate(file, template) {
  if (template) {
    return HtmlService.createTemplateFromFile(file).evaluate().getContent();
  } else {
    return HtmlService.createHtmlOutputFromFile(file).getContent();
  }
}

function ProcessInvites() {
  var calendarId = PropertiesService.getScriptProperties().getProperty('Id');
  var calendar = CalendarApp.getCalendarById(calendarId);

  // Auto-accept any invite between now and two weeks from now.
  var start = new Date();
  var end = new Date(start.getTime() + (1000 * 60 * 60 * 24 * 14));

  var invites = calendar.getEvents(start, end).filter(inviteEventFilters).filter(statusFilters(CalendarApp.GuestStatus.INVITED));

  //Check for conflicts
  for (var i = 0, l = invites.length; i < l; i++) {
    var conflicts = calendar.getEvents(invites[i].getStartTime(), invites[i].getEndTime())
      .filter(statusFilters(CalendarApp.GuestStatus.YES)).filter(conflictEventFilters);
    for (var ci = 0, cl = conflicts.length; ci < cl; ci++) {
      Logger.log("Found a potential conflict to: " + invites[i].getTitle());
      Logger.log("Creator is: " + invites[i].getCreators());
      var conflictStart = Utilities.formatDate(conflicts[ci].getStartTime(), "GMT", "HH:mm");
      var conflictEnd = Utilities.formatDate(conflicts[ci].getEndTime(), "GMT", "HH:mm");
      var conflict = {
        "invite.creators": invites[i].getCreators(),
        "invite.title": invites[i].getTitle(),
        "conflict.start": conflictStart,
        "conflict.end": conflictEnd,
        "conflict.title": conflicts[ci].getTitle(),
        "conflict.creators": conflicts[ci].getCreators()
      };
      Logger.log("Conflict details: " + conflict["conflict.end"])
      var body = importTemplate('AutoResponse').replace(/{{([a-zA-Z\.]+)}}/g, function(match, p1, offset, string) {
        return conflict[p1];
      });
      if (doEmail) {
        GmailApp.sendEmail( calendarId,
          "[Invite conflict] " + invites[i].getTitle(), "",
          { htmlBody: body });
      }
    }

    if (conflicts.length === 0) {
      Logger.log("No conflict, accepting: " + invites[i].getTitle());
      invites[i].setMyStatus(CalendarApp.GuestStatus.YES);
    }
  }
}