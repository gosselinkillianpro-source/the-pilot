import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'the-pilot',
  name: 'THE PILOT',
});

export type AppEvents = {
  'investor.interaction.created': {
    data: {
      investorId: string;
      interactionId: string;
      interactionType: string;
    };
  };
  'investor.became_hot': {
    data: { investorId: string; newScore: number };
  };
  'closer.notification.send': {
    data: { closerId: string; type: string; investorId: string };
  };
};
