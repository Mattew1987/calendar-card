import moment from './locales';

import { LitElement, html } from 'lit-element';
import { repeat } from 'lit-html/directives/repeat';
import packageJson from '../package.json';

import { groupEventsByDay, openLink, getAllEvents, sendNotificationForNewEvents } from './event.tools';

import { 
  getLocationHtml, createHeader, getDateHtml, 
  getProgressBar, getEventOrigin, getTimeHtml,
} from './html.tools';

import style from './style';
import defaultConfig from './defaults';

import CalendarCardEditor from './index-editor';
customElements.define('calendar-card-editor', CalendarCardEditor);

/* eslint no-console: 0 */
console.info(`%c  CALENDAR-CARD   \n%c  Version ${packageJson.version} `, "color: orange; font-weight: bold; background: black", "color: white; font-weight: bold; background: dimgray");


class CalendarCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      events: { type: Object },
    };
  }

  constructor(){
    super();
    this.events = false;
  }

  static async getConfigElement() {
    return document.createElement("calendar-card-editor");
  }

  /**
   * merge the user configuration with default configuration
   * @param {[type]} config
   */
  setConfig(config) {
    config = { ...defaultConfig, ...config };

    if (!config.entities || !config.entities.length) {
      throw new Error('You need to define at least one calendar entity via entities');
    }

    if (config.entities && (isNaN(config.eventsLimit) || config.eventsLimit < 0)) {
      throw new Error('The eventsLimit option needs to be a positive number');
    }

    // if checked entities has changed then update events
    const newNames = (config.entities || []).map(entity => entity.entity || entity);
    const oldNames = ((this.config || {}).entities || []).map(entity => entity.entity || entity);
    if(!this.config || JSON.stringify(newNames) !== JSON.stringify(oldNames) || config.numberOfDays !== this.config.numberOfDays) {
      this.cardNeedsUpdating = true;
    }

    // if anything changed then overall card needs updating
    if(JSON.stringify(config) !== JSON.stringify(this.config || {})) {
      this.cardNeedsUpdating = true;
    }

    this.config = { ...config };
  }

  /**
   * get the size of the card
   * @return {Number}
   */
  getCardSize() {
    return 8;
  }

  static get styles() {
    return style;
  }

  render() {
    this.updateCard();

    return html`
      <ha-card class='calendar-card ${this.config.maxHeight ? 'max-height' : ''}'>
        ${createHeader(this.config)}
        ${this.events ? html`${this.events}` : 
          html`
            <div class='loader'>
              <paper-spinner active></paper-spinner>
            </div>
          `
        }
      </ha-card>
    `;
  }

  /**
   * updates the entire card
   * @return {TemplateResult}
   */
  async updateCard() {
    moment.locale(this.hass.language);

    // dont update if we dont need it to conserve api calls
    if (!this.cardNeedsUpdating && moment().diff(this.lastEventsUpdate, 'seconds') < 600) return;

    this.lastEventsUpdate = moment();
    this.cardNeedsUpdating = false;

    const { events, failedEvents } = await getAllEvents(this.config, this.__hass);
    const groupedEventsByDay = groupEventsByDay(events, this.config);
    
    // send notification of any new events if setup
    this.oldEvents = await sendNotificationForNewEvents(this.config, this.__hass, events, this.oldEvents);

    // get all failed calendar retrievals
    const failedCalendars = failedEvents.reduce((errorTemplate, failedEntity) => {
      return html`
        ${errorTemplate}
        <tr>
          <td class="failed-name">${failedEntity.name}</td>
          <td class="failed-error">${failedEntity.error.error}</td>
          <td class="failed-icon"><ha-icon icon="mdi:alert-circle-outline"></ha-icon></td>
        </tr>
      `;
    }, html``);

    // get today to see what events are today
    const today = moment(new Date());

    const calendar = groupedEventsByDay.reduce((htmlTemplate, eventDay) => {

      // for each event in a day create template for that event
      const eventsTemplate = repeat(eventDay.events, event => event.id, (event, index) => {
        const isLastEventInGroup = eventDay.events.length === index + 1;

        // add class to last event group
        const lastKls = isLastEventInGroup ? 'day-wrapper-last' : '';

        // add class if config to hightlight today's events
        const eventDateTime = moment(eventDay.day);
        const todayKls = this.config.highlightToday && eventDateTime.isSame(today, "day") ? 'highlight-events' : '';

        // use the source element url if it exists
        const linkUrl = this.config.useSourceUrl && event.sourceUrl ? event.sourceUrl : event.htmlLink;
        
        const disableLink = this.config.disableLinks || !linkUrl;

          return html`
            <tr class='day-wrapper ${lastKls} ${todayKls}'>
              <td class="${isLastEventInGroup ? '' : 'date'}">
                ${getDateHtml(index, eventDateTime, this.config)}
              </td>
              <td class="overview ${disableLink ? 'no-pointer' : ''}" @click=${e => openLink(e, linkUrl, this.config)}>
                <div class="title">${event.title}</div>
                ${getTimeHtml(event, this.config)}
                ${getEventOrigin(event, this.config)}
                ${this.config.progressBar ? getProgressBar(event) : ''}
              </td>
              <td class="location">
                ${getLocationHtml(event, this.config)}
              </td>
            </tr>
          `
      });

      return html`
        ${htmlTemplate}
        ${eventsTemplate}
      `;
    }, html``);

    this.events = html`
      <table>
        <tbody>
          ${failedCalendars}
          ${calendar}
        </tbody>
      </table>
    `;
  }
}

customElements.define('calendar-card', CalendarCard);
