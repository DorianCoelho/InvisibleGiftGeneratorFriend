import { createDrawService } from './drawService.js';
import { createEmailDispatcher } from './emailDispatcher.js';
import { createGroupService } from './groupService.js';
import { createMaintenanceService } from './maintenanceService.js';
import { createParticipantService } from './participantService.js';

/** Compone los servicios de la aplicación (inyección de dependencias manual). */
export function createServices({ config, store, crypto, sender, logger }) {
  const dispatcher = createEmailDispatcher({ config, store, crypto, sender, logger });
  const drawService = createDrawService({ store, crypto, logger });
  const groupService = createGroupService({ config, store, crypto, dispatcher, drawService, logger });
  const participantService = createParticipantService({ store, crypto, drawService, groupService, logger });
  const maintenance = createMaintenanceService({ config, store, crypto, dispatcher, drawService, groupService, logger });
  return { dispatcher, drawService, groupService, participantService, maintenance };
}
