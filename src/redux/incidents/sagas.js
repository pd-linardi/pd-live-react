/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable consistent-return */
/* eslint-disable array-callback-return */
import {
  put, call, select, takeLatest, takeEvery, all, take,
} from 'redux-saga/effects';

import Fuse from 'fuse.js';

import axios from 'axios';

import {
  pd, throttledPdAxiosRequest, pdParallelFetch,
} from 'util/pd-api-wrapper';

import {
  filterIncidentsByField,
  filterIncidentsByFieldOfList,
  INCIDENT_API_RESULT_LIMIT,
} from 'util/incidents';
import {
  pushToArray,
} from 'util/helpers';
import fuseOptions from 'config/fuse-config';
import {
  MAX_INCIDENTS_LIMIT, PD_USER_TOKEN,
} from 'config/constants';

import selectQuerySettings from 'redux/query_settings/selectors';
import {
  UPDATE_CONNECTION_STATUS_REQUESTED,
} from 'redux/connection/actions';
import {
  FETCH_INCIDENTS_REQUESTED,
  FETCH_INCIDENTS_COMPLETED,
  FETCH_INCIDENTS_ERROR,
  FETCH_INCIDENT_NOTES_REQUESTED,
  FETCH_INCIDENT_NOTES_COMPLETED,
  FETCH_INCIDENT_NOTES_ERROR,
  FETCH_ALL_INCIDENT_NOTES_REQUESTED,
  FETCH_ALL_INCIDENT_NOTES_COMPLETED,
  FETCH_ALL_INCIDENT_NOTES_ERROR,
  UPDATE_INCIDENTS_LIST,
  UPDATE_INCIDENTS_LIST_COMPLETED,
  UPDATE_INCIDENTS_LIST_ERROR,
  FILTER_INCIDENTS_LIST_BY_PRIORITY,
  FILTER_INCIDENTS_LIST_BY_PRIORITY_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_PRIORITY_ERROR,
  FILTER_INCIDENTS_LIST_BY_STATUS,
  FILTER_INCIDENTS_LIST_BY_STATUS_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_STATUS_ERROR,
  FILTER_INCIDENTS_LIST_BY_URGENCY,
  FILTER_INCIDENTS_LIST_BY_URGENCY_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_URGENCY_ERROR,
  FILTER_INCIDENTS_LIST_BY_TEAM,
  FILTER_INCIDENTS_LIST_BY_TEAM_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_TEAM_ERROR,
  FILTER_INCIDENTS_LIST_BY_SERVICE,
  FILTER_INCIDENTS_LIST_BY_SERVICE_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_SERVICE_ERROR,
  FILTER_INCIDENTS_LIST_BY_QUERY,
  FILTER_INCIDENTS_LIST_BY_QUERY_COMPLETED,
  FILTER_INCIDENTS_LIST_BY_QUERY_ERROR,
} from './actions';
import selectIncidents from './selectors';

export const getIncidentByIdRequest = (incidentId) => call(pd, {
  method: 'get',
  endpoint: `incidents/${incidentId}`,
  data: {
    'include[]': ['external_references'],
  },
});

export function* getIncidentsAsync() {
  yield takeLatest(FETCH_INCIDENTS_REQUESTED, getIncidents);
}

export function* getIncidents() {
  try {
    //  Build base params from query settings
    const {
      // sinceDate,
      // incidentStatus,
      // incidentUrgency,
      // teamIds,
      // serviceIds,
      incidentPriority,
      searchQuery,
    } = yield select(selectQuerySettings);

    // const baseParams = {
    //   since: sinceDate.toISOString(),
    //   until: new Date().toISOString(),
    //   limit: INCIDENT_API_RESULT_LIMIT,
    //   total: true,
    //   include: ['first_trigger_log_entries', 'external_references'],
    // };

    // if (incidentStatus) baseParams.statuses = incidentStatus;
    // if (incidentUrgency) baseParams.urgencies = incidentUrgency;
    // if (teamIds.length) baseParams.team_ids = teamIds;
    // if (serviceIds.length) baseParams.service_ids = serviceIds;

    // // Define API requests to be made in parallel
    // const numberOfApiCalls = Math.ceil(MAX_INCIDENTS_LIMIT / INCIDENT_API_RESULT_LIMIT);
    // const incidentRequests = [];
    // for (let i = 0; i < numberOfApiCalls; i++) {
    //   const params = { ...baseParams };
    //   params.offset = i * INCIDENT_API_RESULT_LIMIT;
    //   incidentRequests.push(call(throttledPdAxiosRequest, 'GET', 'incidents', params));
    // }
    // const incidentResults = yield all(incidentRequests);

    // // Stitch results together
    // const incidentResultsData = incidentResults.map((res) => [...res.data.incidents]);
    // const fetchedIncidents = [];
    // incidentResultsData.forEach((data) => {
    //   data.forEach((incident) => fetchedIncidents.push(incident));
    // });

    // console.log('fetchedIncidents', fetchedIncidents);

    // Experiment Params:
    const sinceDate = '2022-07-28T00%3A00%3A00.000Z';

    // Axios Experiment
    let fetchedIncidentsFromAxios = [];
    let allIncidentIDs;
    let uniqueIncidentIDs;

    const page1Config = {
      method: 'get',
      url: `https://api.pagerduty.com/incidents?limit=100&offset=0&total=true&since=${sinceDate}&statuses[]=resolved&statuses[]=triggered&statuses[]=acknowledged&urgencies[]=high&urgencies[]=low&include[]=first_trigger_log_entries&include[]=external_references`,
      headers: {
        Authorization: `Token token=${PD_USER_TOKEN}`,
        Accept: 'application/vnd.pagerduty+json;version=2',
      },
    };

    const page2Config = {
      method: 'get',
      url: `https://api.pagerduty.com/incidents?limit=100&offset=100&total=true&since=${sinceDate}&statuses[]=resolved&statuses[]=triggered&statuses[]=acknowledged&urgencies[]=high&urgencies[]=low&include[]=first_trigger_log_entries&include[]=external_references`,
      headers: {
        Authorization: `Token token=${PD_USER_TOKEN}`,
        Accept: 'application/vnd.pagerduty+json;version=2',
      },
    };

    axios(page1Config)
      .then((response) => {
        const tempFetchedIncidentsFromAxios = [...response.data.incidents];
        fetchedIncidentsFromAxios = [
          ...fetchedIncidentsFromAxios,
          ...tempFetchedIncidentsFromAxios,
        ];
        allIncidentIDs = tempFetchedIncidentsFromAxios.map((i) => i.id);
        uniqueIncidentIDs = [...new Set(allIncidentIDs)];
        console.log(
          `Axios Call 1: ${allIncidentIDs.length} incidents, ${uniqueIncidentIDs.length} unique, total ${response.data.total}`,
        );
      })
      .catch((error) => {
        console.log(error);
      });

    axios(page2Config)
      .then((response) => {
        const tempFetchedIncidentsFromAxios = [...response.data.incidents];
        fetchedIncidentsFromAxios = [
          ...fetchedIncidentsFromAxios,
          ...tempFetchedIncidentsFromAxios,
        ];
        allIncidentIDs = tempFetchedIncidentsFromAxios.map((i) => i.id);
        uniqueIncidentIDs = [...new Set(allIncidentIDs)];
        console.log(
          `Axios Call 2: ${allIncidentIDs.length} incidents, ${uniqueIncidentIDs.length} unique, total ${response.data.total}`,
        );

        // Combined
        allIncidentIDs = fetchedIncidentsFromAxios.map((i) => i.id);
        uniqueIncidentIDs = [...new Set(allIncidentIDs)];
        console.log(
          `Axios Combined: ${allIncidentIDs.length} incidents, ${uniqueIncidentIDs.length} unique`,
        );
      })
      .catch((error) => {
        console.log(error);
      });

    // throttledPdAxiosRequest Experiment
    const page1ParamsThrottledAxios = {
      since: sinceDate,
      limit: INCIDENT_API_RESULT_LIMIT,
      offset: 0,
      total: true,
      include: ['first_trigger_log_entries', 'external_references'],
      statuses: ['triggered', 'acknowledged', 'resolved'],
      urgencies: ['low', 'high'],
    };

    const page2ParamsThrottledAxios = {
      since: sinceDate,
      limit: INCIDENT_API_RESULT_LIMIT,
      offset: 100,
      total: true,
      include: ['first_trigger_log_entries', 'external_references'],
      statuses: ['triggered', 'acknowledged', 'resolved'],
      urgencies: ['low', 'high'],
    };

    const incidentRequestsThrottledAxios = [];
    let fetchedIncidentsFromThottledAxios = [];
    incidentRequestsThrottledAxios.push(
      call(throttledPdAxiosRequest, 'GET', 'incidents', page1ParamsThrottledAxios),
    );
    incidentRequestsThrottledAxios.push(
      call(throttledPdAxiosRequest, 'GET', 'incidents', page2ParamsThrottledAxios),
    );
    const incidentResultsThrottledAxios = yield all(incidentRequestsThrottledAxios);

    incidentResultsThrottledAxios.forEach((response, idx) => {
      const incidents = [...response.data.incidents];
      fetchedIncidentsFromThottledAxios = [...fetchedIncidentsFromThottledAxios, ...incidents];
      allIncidentIDs = incidents.map((i) => i.id);
      uniqueIncidentIDs = [...new Set(allIncidentIDs)];
      console.log(
        `throttledPdAxiosRequest Call ${idx + 1}: ${allIncidentIDs.length} incidents, ${
          uniqueIncidentIDs.length
        } unique, total ${response.data.total}`,
      );
    });

    allIncidentIDs = fetchedIncidentsFromThottledAxios.map((i) => i.id);
    uniqueIncidentIDs = [...new Set(allIncidentIDs)];
    console.log(
      `throttledPdAxiosRequest Combined: ${allIncidentIDs.length} incidents, ${uniqueIncidentIDs.length} unique`,
    );

    // pdParallelFetch Experiment
    const baseParams = {
      since: sinceDate,
      limit: INCIDENT_API_RESULT_LIMIT,
      total: true,
      include: ['first_trigger_log_entries', 'external_references'],
      statuses: ['triggered', 'acknowledged', 'resolved'],
      urgencies: ['low', 'high'],
    };

    const fetchedIncidents = yield call(
      pdParallelFetch,
      'incidents',
      baseParams,
      MAX_INCIDENTS_LIMIT,
    );

    // Sort incidents by reverse created_at date (i.e. recent incidents at the top)
    fetchedIncidentsFromAxios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    yield put({
      type: FETCH_INCIDENTS_COMPLETED,
      incidents: fetchedIncidentsFromAxios,
    });

    // Filter incident list on priority (can't do this from API)
    yield call(filterIncidentsByPriorityImpl, { incidentPriority });

    // Filter updated incident list by query; updates memoized data within incidents table
    yield call(filterIncidentsByQueryImpl, { searchQuery });
  } catch (e) {
    console.log('err', e);
    yield put({ type: FETCH_INCIDENTS_ERROR, message: e.message });
    yield put({
      type: UPDATE_CONNECTION_STATUS_REQUESTED,
      connectionStatus: 'neutral',
      connectionStatusMessage: 'Unable to fetch incidents',
    });
  }
}

export function* getIncidentNotesAsync() {
  yield takeEvery(FETCH_INCIDENT_NOTES_REQUESTED, getIncidentNotes);
}

export function* getIncidentNotes(action) {
  try {
    // Call PD API to grab note for given Incident ID
    const {
      incidentId,
    } = action;
    const response = yield call(pd.get, `incidents/${incidentId}/notes`);
    const {
      notes,
    } = response.data;

    // Grab matching incident and apply note update
    const {
      incidents,
    } = yield select(selectIncidents);
    const updatedIncidentsList = incidents.map((incident) => {
      if (incident.id === incidentId) {
        const tempIncident = { ...incident };
        tempIncident.notes = notes;
        return tempIncident;
      }
      return incident;
    });

    // Update store with incident having notes data
    yield put({
      type: FETCH_INCIDENT_NOTES_COMPLETED,
      incidents: updatedIncidentsList,
    });
  } catch (e) {
    yield put({ type: FETCH_INCIDENT_NOTES_ERROR, message: e.message });
    yield put({
      type: UPDATE_CONNECTION_STATUS_REQUESTED,
      connectionStatus: 'neutral',
      connectionStatusMessage: 'Unable to fetch incident notes',
    });
  }
}

export function* getAllIncidentNotesAsync() {
  yield takeEvery(FETCH_ALL_INCIDENT_NOTES_REQUESTED, getAllIncidentNotes);
}

export function* getAllIncidentNotes() {
  try {
    // Wait until incidents have been fetched before obtaining notes
    yield take([FETCH_INCIDENTS_COMPLETED, FETCH_INCIDENTS_ERROR]);

    // Build list of promises to call PD endpoint
    const {
      incidents,
    } = yield select(selectIncidents);
    const requests = incidents.map(({
      id,
    }) => throttledPdAxiosRequest('GET', `incidents/${id}/notes`));
    const results = yield Promise.all(requests);

    // Grab matching incident and apply note update
    const updatedIncidentsList = incidents.map((incident, idx) => {
      const tempIncident = { ...incident };
      tempIncident.notes = results[idx].data.notes;
      return tempIncident;
    });

    // Update store with incident having notes data
    yield put({
      type: FETCH_ALL_INCIDENT_NOTES_COMPLETED,
      incidents: updatedIncidentsList,
    });

    /*
      Apply filters that already are configured down below
    */
    const {
      incidentPriority, incidentStatus, incidentUrgency, teamIds, serviceIds, searchQuery,
    } = yield select(selectQuerySettings);

    // Filter updated incident list on priority (can't do this from API)
    yield call(filterIncidentsByPriorityImpl, { incidentPriority });

    // Filter updated incident list on status
    yield call(filterIncidentsByStatusImpl, { incidentStatus });

    // Filter updated incident list on urgency
    yield call(filterIncidentsByUrgencyImpl, { incidentUrgency });

    // Filter updated incident list on team
    yield call(filterIncidentsByTeamImpl, { teamIds });

    // // Filter updated incident list on service
    yield call(filterIncidentsByServiceImpl, { serviceIds });

    // Filter updated incident list by query
    yield call(filterIncidentsByQueryImpl, { searchQuery });
  } catch (e) {
    yield put({ type: FETCH_ALL_INCIDENT_NOTES_ERROR, message: e.message });
    yield put({
      type: UPDATE_CONNECTION_STATUS_REQUESTED,
      connectionStatus: 'neutral',
      connectionStatusMessage: 'Unable to fetch all incident notes',
    });
  }
}

export function* updateIncidentsListAsync() {
  yield takeEvery(UPDATE_INCIDENTS_LIST, updateIncidentsList);
}

export function* updateIncidentsList(action) {
  try {
    const {
      addList, updateList, removeList,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    const {
      incidentPriority, incidentStatus, incidentUrgency, teamIds, serviceIds, searchQuery,
    } = yield select(selectQuerySettings);
    let updatedIncidentsList = [...incidents];

    // Add new incidents to list (need to re-query to get external_references + notes)
    const addListRequests = addList.map((addItem) => {
      if (addItem.incident) return getIncidentByIdRequest(addItem.incident.id);
    });
    const addListResponses = yield all(addListRequests);
    const addListNoteRequests = addList.map((addItem) => {
      if (addItem.incident) return call(pd.get, `incidents/${addItem.incident.id}/notes`);
    });
    const addListNoteResponses = yield all(addListNoteRequests);

    // Synthetically create notes object and add to new incident
    addListResponses.map((response, idx) => {
      const {
        notes,
      } = addListNoteResponses[idx].response.data;
      const newIncident = { ...response.data.incident };
      newIncident.notes = notes;
      updatedIncidentsList.push(newIncident);
    });

    // Update existing incidents within list
    if (incidents.length && updateList.length) {
      updatedIncidentsList = updatedIncidentsList.map((existingIncident) => {
        const updatedItem = updateList.find((updateItem) => {
          if (updateItem.incident) return updateItem.incident.id === existingIncident.id;
        });
        const updatedIncident = updatedItem ? updatedItem.incident : null;
        return updatedIncident ? { ...existingIncident, ...updatedIncident } : existingIncident;
      });
    }

    // Handle where new updates come in against an empty incident list or filtered out incidents
    if (updateList.length) {
      updateList.map((updateItem) => {
        if (updateItem.incident) {
          // Check if item is matched against updatedIncidentsList (skip)
          if (updatedIncidentsList.find((incident) => incident.id === updateItem.incident.id)) {
            return;
          }
          // Update incident list (push if we haven't updated already)
          pushToArray(updatedIncidentsList, updateItem.incident, 'id');
        }
      });
    }

    // Remove incidents within list
    updatedIncidentsList = updatedIncidentsList.filter(
      (existingIncident) => !removeList.some((removeItem) => {
        if (removeItem.incident) return removeItem.incident.id === existingIncident.id;
      }),
    );

    // Sort incidents by reverse created_at date (i.e. recent incidents at the top)
    updatedIncidentsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Remove any unintentional duplicate incidents (i.e. new incident triggered)
    const updatedIncidentsIds = updatedIncidentsList.map((o) => o.id);
    const uniqueUpdatedIncidentsList = updatedIncidentsList.filter(
      ({
        id,
      }, index) => !updatedIncidentsIds.includes(id, index + 1),
    );

    // Update store with updated list of incidents
    yield put({
      type: UPDATE_INCIDENTS_LIST_COMPLETED,
      incidents: uniqueUpdatedIncidentsList,
    });

    /*
      Apply filters that already are configured down below
    */

    // Filter updated incident list on priority (can't do this from API)
    yield call(filterIncidentsByPriorityImpl, { incidentPriority });

    // Filter updated incident list on status
    yield call(filterIncidentsByStatusImpl, { incidentStatus });

    // Filter updated incident list on urgency
    yield call(filterIncidentsByUrgencyImpl, { incidentUrgency });

    // Filter updated incident list on team
    yield call(filterIncidentsByTeamImpl, { teamIds });

    // // Filter updated incident list on service
    yield call(filterIncidentsByServiceImpl, { serviceIds });

    // Filter updated incident list by query
    yield call(filterIncidentsByQueryImpl, { searchQuery });
  } catch (e) {
    yield put({ type: UPDATE_INCIDENTS_LIST_ERROR, message: e.message });
  }
}

export function* filterIncidentsByPriority() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_PRIORITY, filterIncidentsByPriorityImpl);
}

export function* filterIncidentsByPriorityImpl(action) {
  // Filter current incident list by priority
  try {
    const {
      incidentPriority,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    const filteredIncidentsByPriorityList = incidents.filter((incident) => {
      // Incident priority is not always defined - need to check this
      if (incident.priority && incidentPriority.includes(incident.priority.id)) return incident;

      if (!incident.priority && incidentPriority.includes('--')) return incident;
    });
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_PRIORITY_COMPLETED,
      incidents: filteredIncidentsByPriorityList,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_PRIORITY_ERROR,
      message: e.message,
    });
  }
}

export function* filterIncidentsByStatus() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_STATUS, filterIncidentsByStatusImpl);
}

export function* filterIncidentsByStatusImpl(action) {
  // Filter current incident list by status
  try {
    const {
      incidentStatus,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    const filteredIncidentsByStatusList = filterIncidentsByField(
      incidents,
      'status',
      incidentStatus,
    );
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_STATUS_COMPLETED,
      incidents: filteredIncidentsByStatusList,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_STATUS_ERROR,
      message: e.message,
    });
  }
}

export function* filterIncidentsByUrgency() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_URGENCY, filterIncidentsByUrgencyImpl);
}

export function* filterIncidentsByUrgencyImpl(action) {
  // Filter current incident list by urgency
  try {
    const {
      incidentUrgency,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    const filteredIncidentsByUrgencyList = filterIncidentsByField(
      incidents,
      'urgency',
      incidentUrgency,
    );
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_URGENCY_COMPLETED,
      incidents: filteredIncidentsByUrgencyList,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_URGENCY_ERROR,
      message: e.message,
    });
  }
}

export function* filterIncidentsByTeam() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_TEAM, filterIncidentsByTeamImpl);
}

export function* filterIncidentsByTeamImpl(action) {
  // Filter current incident list by team - assume no team set means show everything
  try {
    const {
      teamIds,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    let filteredIncidentsByTeamList;

    // Typically there is no filtered view by teams, so if empty, show all teams.
    if (teamIds.length) {
      filteredIncidentsByTeamList = filterIncidentsByFieldOfList(incidents, 'teams', 'id', teamIds);
    } else {
      filteredIncidentsByTeamList = [...incidents];
    }

    yield put({
      type: FILTER_INCIDENTS_LIST_BY_TEAM_COMPLETED,
      incidents: filteredIncidentsByTeamList,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_TEAM_ERROR,
      message: e.message,
    });
  }
}

export function* filterIncidentsByService() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_SERVICE, filterIncidentsByServiceImpl);
}

export function* filterIncidentsByServiceImpl(action) {
  // Filter current incident list by service
  try {
    const {
      serviceIds,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    let filteredIncidentsByServiceList;

    // Typically there is no filtered view by services, so if empty, show all services.
    if (serviceIds.length) {
      filteredIncidentsByServiceList = filterIncidentsByField(incidents, 'service.id', serviceIds);
    } else {
      filteredIncidentsByServiceList = [...incidents];
    }

    yield put({
      type: FILTER_INCIDENTS_LIST_BY_SERVICE_COMPLETED,
      incidents: filteredIncidentsByServiceList,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_SERVICE_ERROR,
      message: e.message,
    });
  }
}

export function* filterIncidentsByQuery() {
  yield takeLatest(FILTER_INCIDENTS_LIST_BY_QUERY, filterIncidentsByQueryImpl);
}

export function* filterIncidentsByQueryImpl(action) {
  // Filter current incident list by query (aka Global Search)
  try {
    const {
      searchQuery,
    } = action;
    const {
      incidents,
    } = yield select(selectIncidents);
    let filteredIncidentsByQuery;

    if (searchQuery !== '') {
      const fuse = new Fuse(incidents, fuseOptions);
      filteredIncidentsByQuery = fuse.search(searchQuery).map((res) => res.item);
    } else {
      filteredIncidentsByQuery = [...incidents];
    }

    yield put({
      type: FILTER_INCIDENTS_LIST_BY_QUERY_COMPLETED,
      filteredIncidentsByQuery,
    });
  } catch (e) {
    yield put({
      type: FILTER_INCIDENTS_LIST_BY_QUERY_ERROR,
      message: e.message,
    });
  }
}
