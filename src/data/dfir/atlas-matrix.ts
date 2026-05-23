/**
 * AUTO-GENERATED from MITRE ATLAS v5.6.0 (dist/ATLAS.yaml).
 * Do not edit by hand. To resync, run:
 *   node scripts/generate-atlas-matrix.mjs [version]
 *
 * Upstream: https://github.com/mitre-atlas/atlas-data
 * Generated: 2026-05-23 (ATLAS v5.6.0)
 *
 * IDs use dash form (`AML-T0000`, `AML-TA0002`) locally; the backend
 * lookup at `api/src/routes/atlas.ts` canonicalises dot ⇄ dash before
 * querying the live upstream so either form works in URLs.
 */
import type { MitreTechnique, MitreTactic } from './mitre-matrix';

export type { MitreTechnique, MitreTactic };

export const atlasMatrix: MitreTactic[] = [
  {
    id: 'AML-TA0002',
    name: 'Reconnaissance',
    short_name: 'reconnaissance',
    description:
      "The adversary is trying to gather information about the AI system they can use to plan future operations. Reconnaissance consists of techniques that involve adversaries actively or passively gathering information that can be used to support targeting. Such information may include details of the victim organizations' AI…",
    techniques: [
      {
        id: 'AML-T0000',
        name: 'Search Open Technical Databases',
        description:
          'Adversaries may search for publicly available research and technical documentation to learn how and where AI is used within a victim organization. The adversary can use this information to identify targets for attack, or to tailor an existing attack to make it more effective. Organizations often use open source model a…',
        subtechniques: [
          {
            id: 'AML-T0000.000',
            name: 'Journals and Conference Proceedings',
          },
          {
            id: 'AML-T0000.001',
            name: 'Pre-Print Repositories',
          },
          {
            id: 'AML-T0000.002',
            name: 'Technical Blogs',
          },
        ],
      },
      {
        id: 'AML-T0001',
        name: 'Search Open AI Vulnerability Analysis',
        description:
          'Much like the [Search Open Technical Databases](/techniques/AML.T0000), there is often ample research available on the vulnerabilities of common AI models. Once a target has been identified, an adversary will likely try to identify any pre-existing work that has been done for this class of models. This will include not…',
      },
      {
        id: 'AML-T0003',
        name: 'Search Victim-Owned Websites',
        description:
          'Adversaries may search websites owned by the victim for information that can be used during targeting. Victim-owned websites may contain technical details about their AI-enabled products or services. Victim-owned websites may contain a variety of details, including names of departments/divisions, physical locations, an…',
      },
      {
        id: 'AML-T0004',
        name: 'Search Application Repositories',
        description:
          'Adversaries may search open application repositories during targeting. Examples of these include Google Play, the iOS App store, the macOS App Store, and the Microsoft Store. Adversaries may craft search queries seeking applications that contain AI-enabled components. Frequently, the next step is to [Acquire Public AI…',
      },
      {
        id: 'AML-T0006',
        name: 'Active Scanning',
        description:
          "An adversary may probe or scan the victim system to gather information for targeting. This is distinct from other reconnaissance techniques that do not involve direct interaction with the victim system. Adversaries may scan for open ports on a potential victim's network, which can indicate specific services or tools th…",
      },
      {
        id: 'AML-T0064',
        name: 'Gather RAG-Indexed Targets',
        description:
          'Adversaries may identify data sources used in retrieval augmented generation (RAG) systems for targeting purposes. By pinpointing these sources, attackers can focus on poisoning or otherwise manipulating the external data repositories the AI relies on. RAG-indexed data may be identified in public documentation about th…',
      },
      {
        id: 'AML-T0087',
        name: 'Gather Victim Identity Information',
        description:
          "Adversaries may gather information about the victim's identity that can be used during targeting. Information about identities may include a variety of details, including personal data (ex: employee names, email addresses, photos, etc.) as well as sensitive details such as credentials or multi-factor authentication (MF…",
      },
      {
        id: 'AML-T0095',
        name: 'Search Open Websites/Domains',
        description:
          'Adversaries may search public websites and/or domains for information about victims that can be used during targeting. Information about victims may be available in various online sites, such as social media, new sites, or domains owned by the victim. Adversaries may find the information they seek to gather via search…',
        subtechniques: [
          {
            id: 'AML-T0095.000',
            name: 'Code Repositories',
          },
        ],
      },
    ],
  },
  {
    id: 'AML-TA0003',
    name: 'Resource Development',
    short_name: 'resource-development',
    description:
      'The adversary is trying to establish resources they can use to support operations. Resource Development consists of techniques that involve adversaries creating, purchasing, or compromising/stealing resources that can be used to support targeting. Such resources include AI artifacts, infrastructure, accounts, or capabi…',
    techniques: [
      {
        id: 'AML-T0002',
        name: 'Acquire Public AI Artifacts',
        description:
          'Adversaries may search public sources, including cloud storage, public-facing services, and software or data repositories, to identify AI artifacts. These AI artifacts may include the software stack used to train and deploy models, training and testing data, model configurations and parameters. An adversary will be par…',
        subtechniques: [
          {
            id: 'AML-T0002.000',
            name: 'Datasets',
          },
          {
            id: 'AML-T0002.001',
            name: 'Models',
          },
          {
            id: 'AML-T0002.002',
            name: 'AI Agent Configuration',
          },
        ],
      },
      {
        id: 'AML-T0016',
        name: 'Obtain Capabilities',
        description:
          'Adversaries may search for and obtain software capabilities for use in their operations. Capabilities may be specific to AI-based attacks [Adversarial AI Attack Implementations](/techniques/AML.T0016.000) or generic software tools repurposed for malicious intent ([Software Tools](/techniques/AML.T0016.001)). In both in…',
        subtechniques: [
          {
            id: 'AML-T0016.000',
            name: 'Adversarial AI Attack Implementations',
          },
          {
            id: 'AML-T0016.001',
            name: 'Software Tools',
          },
          {
            id: 'AML-T0016.002',
            name: 'Generative AI',
          },
        ],
      },
      {
        id: 'AML-T0017',
        name: 'Develop Capabilities',
        description:
          'Adversaries may develop their own capabilities to support operations. This process encompasses identifying requirements, building solutions, and deploying capabilities. Capabilities used to support attacks on AI-enabled systems are not necessarily AI-based themselves. Examples include setting up websites with adversari…',
        subtechniques: [
          {
            id: 'AML-T0017.000',
            name: 'Adversarial AI Attacks',
          },
        ],
      },
      {
        id: 'AML-T0008',
        name: 'Acquire Infrastructure',
        description:
          'Adversaries may buy, lease, or rent infrastructure for use throughout their operation. A wide variety of infrastructure exists for hosting and orchestrating adversary operations. Infrastructure solutions include physical or cloud servers, domains, mobile devices, and third-party web services. Free resources may also be…',
        subtechniques: [
          {
            id: 'AML-T0008.000',
            name: 'AI Development Workspaces',
          },
          {
            id: 'AML-T0008.001',
            name: 'Consumer Hardware',
          },
          {
            id: 'AML-T0008.002',
            name: 'Domains',
          },
          {
            id: 'AML-T0008.003',
            name: 'Physical Countermeasures',
          },
          {
            id: 'AML-T0008.004',
            name: 'Serverless',
          },
          {
            id: 'AML-T0008.005',
            name: 'AI Service Proxies',
          },
        ],
      },
      {
        id: 'AML-T0019',
        name: 'Publish Poisoned Datasets',
        description:
          'Adversaries may [Poison Training Data](/techniques/AML.T0020) and publish it to a public location. The poisoned dataset may be a novel dataset or a poisoned variant of an existing open source dataset. This data may be introduced to a victim system via [AI Supply Chain Compromise](/techniques/AML.T0010).',
      },
      {
        id: 'AML-T0020',
        name: 'Poison Training Data',
        description:
          'Adversaries may attempt to poison datasets used by an AI model by modifying the underlying data or its labels. This allows the adversary to embed vulnerabilities in AI models trained on the data that may not be easily detectable. Data poisoning attacks may or may not require modifying the labels. The embedded vulnerabi…',
      },
      {
        id: 'AML-T0021',
        name: 'Establish Accounts',
        description:
          'Adversaries may create accounts with various services for use in targeting, to gain access to resources needed in [AI Attack Staging](/tactics/AML.TA0001), or for victim impersonation.',
      },
      {
        id: 'AML-T0058',
        name: 'Publish Poisoned Models',
        description:
          'Adversaries may publish a poisoned model to a public location such as a model registry or code repository. The poisoned model may be a novel model or a poisoned variant of an existing open-source model. This model may be introduced to a victim system via [AI Supply Chain Compromise](/techniques/AML.T0010).',
      },
      {
        id: 'AML-T0060',
        name: 'Publish Hallucinated Entities',
        description:
          'Adversaries may create an entity they control, such as a software package, website, or email address to a source hallucinated by an LLM. The hallucinations may take the form of package names commands, URLs, company names, or email addresses that point the victim to the entity controlled by the adversary. When the victi…',
      },
      {
        id: 'AML-T0065',
        name: 'LLM Prompt Crafting',
        description:
          'Adversaries may use their acquired knowledge of the target generative AI system to craft prompts that bypass its defenses and allow malicious instructions to be executed. The adversary may iterate on the prompt to ensure that it works as-intended consistently.',
      },
      {
        id: 'AML-T0066',
        name: 'Retrieval Content Crafting',
        description:
          'Adversaries may write content designed to be retrieved by user queries and influence a user of the system in some way. This abuses the trust the user has in the system. The crafted content can be combined with a prompt injection. It can also stand alone in a separate document or email. The adversary must get the crafte…',
      },
      {
        id: 'AML-T0079',
        name: 'Stage Capabilities',
        description:
          'Adversaries may upload, install, or otherwise set up capabilities that can be used during targeting. To support their operations, an adversary may need to take capabilities they developed ([Develop Capabilities](/techniques/AML.T0017)) or obtained ([Obtain Capabilities](/techniques/AML.T0016)) and stage them on infrast…',
      },
      {
        id: 'AML-T0104',
        name: 'Publish Poisoned AI Agent Tool',
        description:
          'Adversaries may create and publish poisoned AI agent tools. Poisoned tools may contain an [LLM Prompt Injection](/techniques/AML.T0051), which can lead to a variety of impacts. Tools may be published to open source version control repositories (e.g. GitHub, GitLab), to package registries (e.g. npm), or to repositories…',
      },
    ],
  },
  {
    id: 'AML-TA0004',
    name: 'Initial Access',
    short_name: 'initial-access',
    description:
      'The adversary is trying to gain access to the AI system. The target system could be a network, mobile device, or an edge device such as a sensor platform. The AI capabilities used by the system could be local with onboard or cloud-enabled AI capabilities. Initial Access consists of techniques that use various entry vec…',
    techniques: [
      {
        id: 'AML-T0010',
        name: 'AI Supply Chain Compromise',
        description:
          'Adversaries may gain initial access to a system by compromising the unique portions of the AI supply chain. This could include [Hardware](/techniques/AML.T0010.000), [Data](/techniques/AML.T0010.002) and its annotations, parts of the AI [AI Software](/techniques/AML.T0010.001) stack, or the [Model](/techniques/AML.T001…',
        subtechniques: [
          {
            id: 'AML-T0010.000',
            name: 'Hardware',
          },
          {
            id: 'AML-T0010.001',
            name: 'AI Software',
          },
          {
            id: 'AML-T0010.002',
            name: 'Data',
          },
          {
            id: 'AML-T0010.003',
            name: 'Model',
          },
          {
            id: 'AML-T0010.004',
            name: 'Container Registry',
          },
          {
            id: 'AML-T0010.005',
            name: 'AI Agent Tool',
          },
        ],
      },
      {
        id: 'AML-T0012',
        name: 'Valid Accounts',
        description:
          'Adversaries may obtain and abuse credentials of existing accounts as a means of gaining Initial Access. Credentials may take the form of usernames and passwords of individual user accounts or API keys that provide access to various AI resources and services. Compromised credentials may provide access to additional AI a…',
      },
      {
        id: 'AML-T0015',
        name: 'Evade AI Model',
        description:
          'Adversaries can [Craft Adversarial Data](/techniques/AML.T0043) that prevents an AI model from correctly identifying the contents of the data or [Generate Deepfakes](/techniques/AML.T0088) that fools an AI model expecting authentic data. This technique can be used to evade a downstream task where AI is utilized. The ad…',
      },
      {
        id: 'AML-T0049',
        name: 'Exploit Public-Facing Application',
        description:
          'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer or program using software, data, or commands in order to cause unintended or unanticipated behavior. The weakness in the system can be a bug, a glitch, or a design vulnerability. These applications are often websites, but can include…',
      },
      {
        id: 'AML-T0052',
        name: 'Phishing',
        description:
          'Adversaries may send phishing messages to gain access to victim systems. All forms of phishing are electronically delivered social engineering. Phishing can be targeted, known as spearphishing. In spearphishing, a specific individual, company, or industry will be targeted by the adversary. More generally, adversaries c…',
        subtechniques: [
          {
            id: 'AML-T0052.000',
            name: 'Spearphishing via Social Engineering LLM',
          },
          {
            id: 'AML-T0052.001',
            name: 'Deepfake-Assisted Phishing',
          },
        ],
      },
      {
        id: 'AML-T0078',
        name: 'Drive-by Compromise',
        description:
          'Adversaries may gain access to an AI system through a user visiting a website over the normal course of browsing, or an AI agent retrieving information from the web on behalf of a user. Websites can contain an [LLM Prompt Injection](/techniques/AML.T0051) which, when executed, can change the behavior of the AI model. T…',
      },
      {
        id: 'AML-T0093',
        name: 'Prompt Infiltration via Public-Facing Application',
        description:
          "An adversary may introduce malicious prompts into the victim's system via a public-facing application with the intention of it being ingested by an AI at some point in the future and ultimately having a downstream effect. This may occur when a data source is indexed by a retrieval augmented generation (RAG) system, whe…",
      },
    ],
  },
  {
    id: 'AML-TA0000',
    name: 'AI Model Access',
    short_name: 'ai-model-access',
    description:
      'The adversary is attempting to gain some level of access to an AI model. AI Model Access enables techniques that use various types of access to the AI model that can be used by the adversary to gain information, develop attacks, and as a means to input data to the model. The level of access can range from the full know…',
    techniques: [
      {
        id: 'AML-T0040',
        name: 'AI Model Inference API Access',
        description:
          'Adversaries may gain access to a model via legitimate access to the inference API. Inference API access can be a source of information to the adversary ([Discover AI Model Ontology](/techniques/AML.T0013), [Discover AI Model Family](/techniques/AML.T0014)), a means of staging the attack ([Verify Attack](/techniques/AML…',
      },
      {
        id: 'AML-T0047',
        name: 'AI-Enabled Product or Service',
        description:
          'Adversaries may use a product or service that uses artificial intelligence under the hood to gain access to the underlying AI model. This type of indirect model access may reveal details of the AI model or its inferences in logs or metadata.',
      },
      {
        id: 'AML-T0041',
        name: 'Physical Environment Access',
        description:
          'In addition to the attacks that take place purely in the digital domain, adversaries may also exploit the physical environment for their attacks. If the model is interacting with data collected from the real world in some way, the adversary can influence the model through access to wherever the data is being collected.…',
      },
      {
        id: 'AML-T0044',
        name: 'Full AI Model Access',
        description:
          'Adversaries may gain full "white-box" access to an AI model. This means the adversary has complete knowledge of the model architecture, its parameters, and class ontology. They may exfiltrate the model to [Craft Adversarial Data](/techniques/AML.T0043) and [Verify Attack](/techniques/AML.T0042) in an offline where it i…',
      },
    ],
  },
  {
    id: 'AML-TA0005',
    name: 'Execution',
    short_name: 'execution',
    description:
      'The adversary is trying to run malicious code embedded in AI artifacts or software. Execution consists of techniques that result in adversary-controlled code running on a local or remote system. Techniques that run malicious code are often paired with techniques from all other tactics to achieve broader goals, like exp…',
    techniques: [
      {
        id: 'AML-T0011',
        name: 'User Execution',
        description:
          'An adversary may rely upon specific actions by a user in order to gain execution. Users may inadvertently execute unsafe code introduced via [AI Supply Chain Compromise](/techniques/AML.T0010). Users may be subjected to social engineering to get them to execute malicious code by, for example, opening a malicious docume…',
        subtechniques: [
          {
            id: 'AML-T0011.000',
            name: 'Unsafe AI Artifacts',
          },
          {
            id: 'AML-T0011.001',
            name: 'Malicious Package',
          },
          {
            id: 'AML-T0011.002',
            name: 'Poisoned AI Agent Tool',
          },
          {
            id: 'AML-T0011.003',
            name: 'Malicious Link',
          },
        ],
      },
      {
        id: 'AML-T0050',
        name: 'Command and Scripting Interpreter',
        description:
          'Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries. These interfaces and languages provide ways of interacting with computer systems and are a common feature across many different platforms. Most systems come with some built-in command-line interface and scripting capabiliti…',
      },
      {
        id: 'AML-T0051',
        name: 'LLM Prompt Injection',
        description:
          'An adversary may craft malicious prompts as inputs to an LLM that cause the LLM to act in unintended ways. These "prompt injections" are often designed to cause the model to ignore aspects of its original instructions and follow the adversary\'s instructions instead. Prompt Injections can be an initial access vector to…',
        subtechniques: [
          {
            id: 'AML-T0051.000',
            name: 'Direct',
          },
          {
            id: 'AML-T0051.001',
            name: 'Indirect',
          },
          {
            id: 'AML-T0051.002',
            name: 'Triggered',
          },
        ],
      },
      {
        id: 'AML-T0053',
        name: 'AI Agent Tool Invocation',
        description:
          'Adversaries may use their access to an AI agent to invoke tools the agent has access to. LLMs are often connected to other services or resources via tools to increase their capabilities. Tools may include integrations with other applications, access to public or private data sources, and the ability to execute code. Th…',
      },
      {
        id: 'AML-T0100',
        name: 'AI Agent Clickbait',
        description:
          "Adversaries may craft deceptive web content designed to bait Computer-Using AI agents or AI web browsers into taking unintended actions, such as clicking buttons, copying code, or navigating to specific web pages. These attacks exploit the agent's interpretation of UI content, visual cues, or prompt-like language embed…",
      },
      {
        id: 'AML-T0103',
        name: 'Deploy AI Agent',
        description:
          "Adversaries may launch AI agents in the victim's environment to execute actions on their behalf. AI agents may have access to a wide range of tools and data sources, as well as permissions to access and interact with other services and systems in the victim's environment. The adversary may leverage these capabilities t…",
      },
    ],
  },
  {
    id: 'AML-TA0006',
    name: 'Persistence',
    short_name: 'persistence',
    description:
      'The adversary is trying to maintain their foothold via AI artifacts or software. Persistence consists of techniques that adversaries use to keep access to systems across restarts, changed credentials, and other interruptions that could cut off their access. Techniques used for persistence often involve leaving behind m…',
    techniques: [
      {
        id: 'AML-T0020',
        name: 'Poison Training Data',
        description:
          'Adversaries may attempt to poison datasets used by an AI model by modifying the underlying data or its labels. This allows the adversary to embed vulnerabilities in AI models trained on the data that may not be easily detectable. Data poisoning attacks may or may not require modifying the labels. The embedded vulnerabi…',
      },
      {
        id: 'AML-T0018',
        name: 'Manipulate AI Model',
        description:
          'Adversaries may directly manipulate an AI model to change its behavior or introduce malicious code. Manipulating a model gives the adversary a persistent change in the system. This can include poisoning the model by changing its weights, modifying the model architecture to change its behavior, and embedding malware whi…',
        subtechniques: [
          {
            id: 'AML-T0018.000',
            name: 'Poison AI Model',
          },
          {
            id: 'AML-T0018.001',
            name: 'Modify AI Model Architecture',
          },
          {
            id: 'AML-T0018.002',
            name: 'Embed Malware',
          },
        ],
      },
      {
        id: 'AML-T0061',
        name: 'LLM Prompt Self-Replication',
        description:
          'An adversary may use a carefully crafted [LLM Prompt Injection](/techniques/AML.T0051) designed to cause the LLM to replicate the prompt as part of its output. This allows the prompt to propagate to other LLMs and persist on the system. The self-replicating prompt is typically paired with other malicious instructions (…',
      },
      {
        id: 'AML-T0070',
        name: 'RAG Poisoning',
        description:
          'Adversaries may inject malicious content into data indexed by a retrieval augmented generation (RAG) system to contaminate a future thread through RAG-based search results. This may be accomplished by placing manipulated documents in a location the RAG indexes (see [Gather RAG-Indexed Targets](/techniques/AML.T0064)).…',
      },
      {
        id: 'AML-T0080',
        name: 'AI Agent Context Poisoning',
        description:
          "Adversaries may attempt to manipulate the context used by an AI agent's large language model (LLM) to influence the responses it generates or actions it takes. This allows an adversary to persistently change the behavior of the target agent and further their goals. Context poisoning can be accomplished by prompting the…",
        subtechniques: [
          {
            id: 'AML-T0080.000',
            name: 'Memory',
          },
          {
            id: 'AML-T0080.001',
            name: 'Thread',
          },
        ],
      },
      {
        id: 'AML-T0081',
        name: 'Modify AI Agent Configuration',
        description:
          'Adversaries may modify the configuration files for AI agents on a system. This allows malicious changes to persist beyond the life of a single agent and affects any agents that share the configuration. Configuration changes may include modifications to the system prompt, tampering with or replacing knowledge sources, m…',
      },
      {
        id: 'AML-T0093',
        name: 'Prompt Infiltration via Public-Facing Application',
        description:
          "An adversary may introduce malicious prompts into the victim's system via a public-facing application with the intention of it being ingested by an AI at some point in the future and ultimately having a downstream effect. This may occur when a data source is indexed by a retrieval augmented generation (RAG) system, whe…",
      },
      {
        id: 'AML-T0099',
        name: 'AI Agent Tool Data Poisoning',
        description:
          "Adversaries may place malicious content on a victim's system where it can be retrieved by an AI Agent Tool. This may be accomplished by placing documents in a location that will be ingested by a service the AI agent has associated tools for. The content may be targeted such that it would often be retrieved by common qu…",
      },
      {
        id: 'AML-T0110',
        name: 'AI Agent Tool Poisoning',
        description:
          "Adversaries may achieve persistence by poisoning tools used by AI agents including built-in tools or tools available to the agent via Model Context Protocol (MCP) connections. This involves compromising benign tools already integrated into the agent's environment. By altering tool behavior such as modifying parameters…",
      },
    ],
  },
  {
    id: 'AML-TA0012',
    name: 'Privilege Escalation',
    short_name: 'privilege-escalation',
    description:
      'The adversary is trying to gain higher-level permissions. Privilege Escalation consists of techniques that adversaries use to gain higher-level permissions on a system or network. Adversaries can often enter and explore a network with unprivileged access but require elevated permissions to follow through on their objec…',
    techniques: [
      {
        id: 'AML-T0012',
        name: 'Valid Accounts',
        description:
          'Adversaries may obtain and abuse credentials of existing accounts as a means of gaining Initial Access. Credentials may take the form of usernames and passwords of individual user accounts or API keys that provide access to various AI resources and services. Compromised credentials may provide access to additional AI a…',
      },
      {
        id: 'AML-T0053',
        name: 'AI Agent Tool Invocation',
        description:
          'Adversaries may use their access to an AI agent to invoke tools the agent has access to. LLMs are often connected to other services or resources via tools to increase their capabilities. Tools may include integrations with other applications, access to public or private data sources, and the ability to execute code. Th…',
      },
      {
        id: 'AML-T0054',
        name: 'LLM Jailbreak',
        description:
          'Adversaries may induce a large language model (LLM) to ignore, circumvent, or override its safety/alignment behaviors and/or guardails to elicit outputs the model is intended to withhold. Once jailbroken, the LLM may be used in unintended ways by the adversary. Jailbreaks may be achieved via adversarial prompting, or b…',
      },
      {
        id: 'AML-T0105',
        name: 'Escape to Host',
        description:
          'Adversaries may break out of a container or virtualized environment to gain access to the underlying host. This can allow an adversary access to other containerized or virtualized resources from the host level or to the host itself. In principle, containerized / virtualized resources should provide a clear separation o…',
      },
    ],
  },
  {
    id: 'AML-TA0007',
    name: 'Defense Evasion',
    short_name: 'defense-evasion',
    description:
      'The adversary is trying to avoid being detected by AI-enabled security software. Defense Evasion consists of techniques that adversaries use to avoid detection throughout their compromise. Techniques used for defense evasion include evading AI-enabled security software such as malware detectors.',
    techniques: [
      {
        id: 'AML-T0015',
        name: 'Evade AI Model',
        description:
          'Adversaries can [Craft Adversarial Data](/techniques/AML.T0043) that prevents an AI model from correctly identifying the contents of the data or [Generate Deepfakes](/techniques/AML.T0088) that fools an AI model expecting authentic data. This technique can be used to evade a downstream task where AI is utilized. The ad…',
      },
      {
        id: 'AML-T0054',
        name: 'LLM Jailbreak',
        description:
          'Adversaries may induce a large language model (LLM) to ignore, circumvent, or override its safety/alignment behaviors and/or guardails to elicit outputs the model is intended to withhold. Once jailbroken, the LLM may be used in unintended ways by the adversary. Jailbreaks may be achieved via adversarial prompting, or b…',
      },
      {
        id: 'AML-T0067',
        name: 'LLM Trusted Output Components Manipulation',
        description:
          "Adversaries may utilize prompts to a large language model (LLM) which manipulate various components of its response in order to make it appear trustworthy to the user. This helps the adversary continue to operate in the victim's environment and evade detection by the users it interacts with. The LLM may be instructed t…",
        subtechniques: [
          {
            id: 'AML-T0067.000',
            name: 'Citations',
          },
        ],
      },
      {
        id: 'AML-T0068',
        name: 'LLM Prompt Obfuscation',
        description:
          'Adversaries may hide or otherwise obfuscate prompt injections or retrieval content to avoid detection from humans, large language model (LLM) guardrails, or other detection mechanisms. For text inputs, this may include modifying how the instructions are rendered such as small text, text colored the same as the backgrou…',
      },
      {
        id: 'AML-T0071',
        name: 'False RAG Entry Injection',
        description:
          "Adversaries may introduce false entries into a victim's retrieval augmented generation (RAG) database. Content designed to be interpreted as a document by the large language model (LLM) used in the RAG system is included in a data source being ingested into the RAG database. When RAG entry including the false document…",
      },
      {
        id: 'AML-T0073',
        name: 'Impersonation',
        description:
          'Adversaries may impersonate a trusted person or organization in order to persuade and trick a target into performing some action on their behalf. For example, adversaries may communicate with victims (via [Phishing](/techniques/AML.T0052), or [Spearphishing via Social Engineering LLM](/techniques/AML.T0052.000)) while…',
      },
      {
        id: 'AML-T0074',
        name: 'Masquerading',
        description:
          'Adversaries may attempt to manipulate features of their artifacts to make them appear legitimate or benign to users and/or security tools. Masquerading occurs when the name or location of an object, legitimate or malicious, is manipulated or abused for the sake of evading defenses and observation. This may include mani…',
      },
      {
        id: 'AML-T0076',
        name: 'Corrupt AI Model',
        description:
          'An adversary may purposefully corrupt a malicious AI model file so that it cannot be successfully deserialized in order to evade detection by a model scanner. The corrupt model may still successfully execute malicious code before deserialization fails.',
      },
      {
        id: 'AML-T0081',
        name: 'Modify AI Agent Configuration',
        description:
          'Adversaries may modify the configuration files for AI agents on a system. This allows malicious changes to persist beyond the life of a single agent and affects any agents that share the configuration. Configuration changes may include modifications to the system prompt, tampering with or replacing knowledge sources, m…',
      },
      {
        id: 'AML-T0092',
        name: 'Manipulate User LLM Chat History',
        description:
          "Adversaries may manipulate a user's large language model (LLM) chat history to cover the tracks of their malicious behavior. They may hide persistent changes they have made to the LLM's behavior, or obscure their attempts at discovering private information about the user. To do so, adversaries may delete or edit existi…",
      },
      {
        id: 'AML-T0094',
        name: 'Delay Execution of LLM Instructions',
        description:
          'Adversaries may include instructions to be followed by the AI system in response to a future event, such as a specific keyword or the next interaction, in order to evade detection or bypass controls placed on the AI system. For example, an adversary may include "If the user submits a new request..." followed by the mal…',
      },
      {
        id: 'AML-T0097',
        name: 'Virtualization/Sandbox Evasion',
        description:
          'Adversaries may employ various means to detect and avoid virtualization and analysis environments. This may include changing behaviors based on the results of checks for the presence of artifacts indicative of a virtual machine environment (VME) or sandbox. If the adversary detects a VME, they may alter their malware t…',
      },
      {
        id: 'AML-T0107',
        name: 'Exploitation for Defense Evasion',
        description:
          'Adversaries may exploit a system or application vulnerability to bypass security features. Exploitation of a vulnerability occurs when an adversary takes advantage of a programming error in a program, service, or within the operating system software or kernel itself to execute adversary-controlled code. Vulnerabilities…',
      },
      {
        id: 'AML-T0109',
        name: 'AI Supply Chain Rug Pull',
        description:
          'Adversaries may publish legitimate AI components or software, gain user adoption, then push an update with a malicious variant, leading to [AI Supply Chain Compromise](/techniques/AML.T0010). More scrutiny is often placed on a supply chain dependency when it is first being considered for inclusion in an AI system. Perf…',
      },
      {
        id: 'AML-T0111',
        name: 'AI Supply Chain Reputation Inflation',
        description:
          'AI Supply Chain Reputation Inflation is the process of building or leveraging genuinely credible-looking trust signals to increase the perceived legitimacy of AI supply chain components, with the goal of driving adoption of malicious or compromised assets. Adversaries use established developer accounts with a history o…',
      },
    ],
  },
  {
    id: 'AML-TA0013',
    name: 'Credential Access',
    short_name: 'credential-access',
    description:
      'The adversary is trying to steal account names and passwords. Credential Access consists of techniques for stealing credentials like account names and passwords. Techniques used to get credentials include keylogging or credential dumping. Using legitimate credentials can give adversaries access to systems, make them ha…',
    techniques: [
      {
        id: 'AML-T0055',
        name: 'Unsecured Credentials',
        description:
          'Adversaries may search compromised systems to find and obtain insecurely stored credentials. These credentials can be stored and/or misplaced in many locations on a system, including plaintext files (e.g. bash history), environment variables, operating system, or application-specific repositories (e.g. Credentials in R…',
      },
      {
        id: 'AML-T0082',
        name: 'RAG Credential Harvesting',
        description:
          "Adversaries may attempt to use their access to a large language model (LLM) on the victim's system to collect credentials. Credentials may be stored in internal documents which can inadvertently be ingested into a RAG database, where they can ultimately be retrieved by an AI agent.",
      },
      {
        id: 'AML-T0083',
        name: 'Credentials from AI Agent Configuration',
        description:
          'Adversaries may access the credentials of other tools or services on a system from the configuration of an AI agent. AI Agents often utilize external tools or services to take actions, such as querying databases, invoking APIs, or interacting with cloud resources. To enable these functions, credentials like API keys, t…',
      },
      {
        id: 'AML-T0090',
        name: 'OS Credential Dumping',
        description:
          'Adversaries may extract credentials from OS caches, application memory, or other sources on a compromised system. Credentials are often in the form of a hash or clear text, and can include usernames and passwords, application tokens, or other authentication keys. Credentials can be used to perform [Lateral Movement](/t…',
      },
      {
        id: 'AML-T0098',
        name: 'AI Agent Tool Credential Harvesting',
        description:
          "Adversaries may attempt to use their access to an AI agent on the victim's system to retrieve data from available agent tools to collect credentials. Agent tools may connect to a wide range of sources that may contain credentials including document stores (e.g. SharePoint, OneDrive or Google Drive), code repositories (…",
      },
      {
        id: 'AML-T0106',
        name: 'Exploitation for Credential Access',
        description:
          'Adversaries may exploit software vulnerabilities in an attempt to collect credentials. Exploitation of a software vulnerability occurs when an adversary takes advantage of a programming error in a program, service, or within the operating system software or kernel itself to execute adversary-controlled code.',
      },
    ],
  },
  {
    id: 'AML-TA0008',
    name: 'Discovery',
    short_name: 'discovery',
    description:
      'The adversary is trying to figure out your AI environment. Discovery consists of techniques an adversary may use to gain knowledge about the system and internal network. These techniques help adversaries observe the environment and orient themselves before deciding how to act. They also allow adversaries to explore wha…',
    techniques: [
      {
        id: 'AML-T0013',
        name: 'Discover AI Model Ontology',
        description:
          "Adversaries may discover the ontology of an AI model's output space, for example, the types of objects a model can detect. The adversary may discovery the ontology by repeated queries to the model, forcing it to enumerate its output space. Or the ontology may be discovered in a configuration file or in documentation ab…",
      },
      {
        id: 'AML-T0014',
        name: 'Discover AI Model Family',
        description:
          "Adversaries may discover the general family of model. General information about the model may be revealed in documentation, or the adversary may use carefully constructed examples and analyze the model's responses to categorize it. Knowledge of the model family can help the adversary identify means of attacking the mod…",
      },
      {
        id: 'AML-T0007',
        name: 'Discover AI Artifacts',
        description:
          'Adversaries may search private sources to identify AI learning artifacts that exist on the system and gather information about them. These artifacts can include the software stack used to train and deploy models, training and testing data management systems, container registries, software repositories, and model zoos.…',
      },
      {
        id: 'AML-T0062',
        name: 'Discover LLM Hallucinations',
        description:
          'Adversaries may prompt large language models and identify hallucinated entities. They may request software packages, commands, URLs, organization names, or e-mail addresses, and identify hallucinations with no connected real-world source. Discovered hallucinations provide the adversary with potential targets to [Publis…',
      },
      {
        id: 'AML-T0063',
        name: 'Discover AI Model Outputs',
        description:
          'Adversaries may discover model outputs, such as class scores, whose presence is not required for the system to function and are not intended for use by the end user. Model outputs may be found in logs or may be included in API responses. Model outputs may enable the adversary to identify weaknesses in the model and dev…',
      },
      {
        id: 'AML-T0069',
        name: 'Discover LLM System Information',
        description:
          "The adversary is trying to discover something about the large language model's (LLM) system information. This may be found in a configuration file containing the system instructions or extracted via interactions with the LLM. The desired information may include the full system prompt, special characters that have signi…",
        subtechniques: [
          {
            id: 'AML-T0069.000',
            name: 'Special Character Sets',
          },
          {
            id: 'AML-T0069.001',
            name: 'System Instruction Keywords',
          },
          {
            id: 'AML-T0069.002',
            name: 'System Prompt',
          },
        ],
      },
      {
        id: 'AML-T0075',
        name: 'Cloud Service Discovery',
        description:
          'Adversaries may attempt to enumerate the cloud services running on a system after gaining access. These methods can differ from platform-as-a-service (PaaS), to infrastructure-as-a-service (IaaS), software-as-a-service (SaaS), or AI-as-a-service (AIaaS). Many services exist throughout the various cloud providers and ca…',
      },
      {
        id: 'AML-T0084',
        name: 'Discover AI Agent Configuration',
        description:
          "Adversaries may attempt to discover configuration information for AI agents present on the victim's system. Agent configurations can include tools or services they have access to. Adversaries may directly access agent configuring dashboards or configuration files. They may also obtain configuration details by prompting…",
        subtechniques: [
          {
            id: 'AML-T0084.000',
            name: 'Embedded Knowledge',
          },
          {
            id: 'AML-T0084.001',
            name: 'Tool Definitions',
          },
          {
            id: 'AML-T0084.002',
            name: 'Activation Triggers',
          },
          {
            id: 'AML-T0084.003',
            name: 'Call Chains',
          },
        ],
      },
      {
        id: 'AML-T0089',
        name: 'Process Discovery',
        description:
          'Adversaries may attempt to get information about processes running on a system. Once obtained, this information could be used to gain an understanding of common AI-related software/applications running on systems within the network. Administrator or otherwise elevated access may provide better process details. Identify…',
      },
    ],
  },
  {
    id: 'AML-TA0015',
    name: 'Lateral Movement',
    short_name: 'lateral-movement',
    description:
      'The adversary is trying to move through your AI environment. Lateral Movement consists of techniques that adversaries may use to gain access to and control other systems or components in the environment. Adversaries may pivot towards AI Ops infrastructure such as model registries, experiment trackers, vector databases,…',
    techniques: [
      {
        id: 'AML-T0052',
        name: 'Phishing',
        description:
          'Adversaries may send phishing messages to gain access to victim systems. All forms of phishing are electronically delivered social engineering. Phishing can be targeted, known as spearphishing. In spearphishing, a specific individual, company, or industry will be targeted by the adversary. More generally, adversaries c…',
        subtechniques: [
          {
            id: 'AML-T0052.000',
            name: 'Spearphishing via Social Engineering LLM',
          },
          {
            id: 'AML-T0052.001',
            name: 'Deepfake-Assisted Phishing',
          },
        ],
      },
      {
        id: 'AML-T0091',
        name: 'Use Alternate Authentication Material',
        description:
          'Adversaries may use alternate authentication material, such as password hashes, Kerberos tickets, and application access tokens, in order to move laterally within an environment and bypass normal system access controls. AI services commonly use alternate authentication material as a primary means for users to make quer…',
        subtechniques: [
          {
            id: 'AML-T0091.000',
            name: 'Application Access Token',
          },
        ],
      },
    ],
  },
  {
    id: 'AML-TA0009',
    name: 'Collection',
    short_name: 'collection',
    description:
      "The adversary is trying to gather AI artifacts and other related information relevant to their goal. Collection consists of techniques adversaries may use to gather information and the sources information is collected from that are relevant to following through on the adversary's objectives. Frequently, the next goal a…",
    techniques: [
      {
        id: 'AML-T0035',
        name: 'AI Artifact Collection',
        description:
          'Adversaries may collect AI artifacts for [Exfiltration](/tactics/AML.TA0010) or for use in [AI Attack Staging](/tactics/AML.TA0001). AI artifacts include models and datasets as well as other telemetry data produced when interacting with a model.',
      },
      {
        id: 'AML-T0036',
        name: 'Data from Information Repositories',
        description:
          'Adversaries may leverage information repositories to mine valuable information. Information repositories are tools that allow for storage of information, typically to facilitate collaboration or information sharing between users, and can store a wide variety of data that may aid adversaries in further objectives, or di…',
      },
      {
        id: 'AML-T0037',
        name: 'Data from Local System',
        description:
          'Adversaries may search local system sources, such as file systems and configuration files or local databases, to find files of interest and sensitive data prior to Exfiltration. This can include basic fingerprinting information and sensitive data such as ssh keys.',
      },
      {
        id: 'AML-T0085',
        name: 'Data from AI Services',
        description:
          "Adversaries may use their access to a victim organization's AI-enabled services to collect proprietary or otherwise sensitive information. As organizations adopt generative AI in centralized services for accessing an organization's data, such as with chat agents which can access retrieval augmented generation (RAG) dat…",
        subtechniques: [
          {
            id: 'AML-T0085.000',
            name: 'RAG Databases',
          },
          {
            id: 'AML-T0085.001',
            name: 'AI Agent Tools',
          },
        ],
      },
    ],
  },
  {
    id: 'AML-TA0001',
    name: 'AI Attack Staging',
    short_name: 'ai-attack-staging',
    description:
      'The adversary is leveraging their knowledge of and access to the target system to tailor the attack. AI Attack Staging consists of techniques adversaries use to prepare their attack on the target AI model. Techniques can include training proxy models, poisoning the target model, and crafting adversarial data to feed th…',
    techniques: [
      {
        id: 'AML-T0005',
        name: 'Create Proxy AI Model',
        description:
          'Adversaries may obtain models to serve as proxies for the target model in use at the victim organization. Proxy models are used to simulate complete access to the target model in a fully offline manner. Adversaries may train models from representative datasets, attempt to replicate models from victim inference APIs, or…',
        subtechniques: [
          {
            id: 'AML-T0005.000',
            name: 'Train Proxy via Gathered AI Artifacts',
          },
          {
            id: 'AML-T0005.001',
            name: 'Train Proxy via Replication',
          },
          {
            id: 'AML-T0005.002',
            name: 'Use Pre-Trained Model',
          },
        ],
      },
      {
        id: 'AML-T0018',
        name: 'Manipulate AI Model',
        description:
          'Adversaries may directly manipulate an AI model to change its behavior or introduce malicious code. Manipulating a model gives the adversary a persistent change in the system. This can include poisoning the model by changing its weights, modifying the model architecture to change its behavior, and embedding malware whi…',
        subtechniques: [
          {
            id: 'AML-T0018.000',
            name: 'Poison AI Model',
          },
          {
            id: 'AML-T0018.001',
            name: 'Modify AI Model Architecture',
          },
          {
            id: 'AML-T0018.002',
            name: 'Embed Malware',
          },
        ],
      },
      {
        id: 'AML-T0042',
        name: 'Verify Attack',
        description:
          'Adversaries can verify the efficacy of their attack via an inference API or access to an offline copy of the target model. This gives the adversary confidence that their approach works and allows them to carry out the attack at a later time of their choosing. The adversary may verify the attack once but use it against…',
      },
      {
        id: 'AML-T0043',
        name: 'Craft Adversarial Data',
        description:
          "Adversarial data are inputs to an AI model that have been modified such that they cause the adversary's desired effect in the target model. Effects can range from misclassification, to missed detections, to maximizing energy consumption. Typically, the modification is constrained in magnitude or location so that a huma…",
        subtechniques: [
          {
            id: 'AML-T0043.000',
            name: 'White-Box Optimization',
          },
          {
            id: 'AML-T0043.001',
            name: 'Black-Box Optimization',
          },
          {
            id: 'AML-T0043.002',
            name: 'Black-Box Transfer',
          },
          {
            id: 'AML-T0043.003',
            name: 'Manual Modification',
          },
          {
            id: 'AML-T0043.004',
            name: 'Insert Backdoor Trigger',
          },
        ],
      },
      {
        id: 'AML-T0088',
        name: 'Generate Deepfakes',
        description:
          'Adversaries may use generative artificial intelligence (GenAI) to create synthetic media (i.e. imagery, video, audio, and text) that appear authentic. These "[deepfakes]( https://en.wikipedia.org/wiki/Deepfake)" may mimic a real person or depict fictional personas. Adversaries may use deepfakes for impersonation to con…',
      },
      {
        id: 'AML-T0102',
        name: 'Generate Malicious Commands',
        description:
          'Adversaries may use large language models (LLMs) to dynamically generate malicious commands from natural language. Dynamically generated commands may be harder detect as the attack signature is constantly changing. AI-generated commands may also allow adversaries to more rapidly adapt to different environments and adju…',
      },
    ],
  },
  {
    id: 'AML-TA0014',
    name: 'Command and Control',
    short_name: 'command-and-control',
    description:
      'The adversary is trying to communicate with compromised AI systems to control them. Command and Control consists of techniques that adversaries may use to communicate with systems under their control within a victim network. Adversaries commonly attempt to mimic normal, expected traffic to avoid detection. There are ma…',
    techniques: [
      {
        id: 'AML-T0072',
        name: 'Reverse Shell',
        description:
          'Adversaries may utilize a reverse shell to communicate and control the victim system. Typically, a user uses a client to connect to a remote machine which is listening for connections. With a reverse shell, the adversary is listening for incoming connections initiated from the victim system.',
      },
      {
        id: 'AML-T0096',
        name: 'AI Service API',
        description:
          "Adversaries may communicate using the API of an AI service on the victim's system. The adversary's commands to the victim system, and often the results, are embedded in the normal traffic of the AI service. An AI service API command and control channel is covert because the adversary's commands blend in with normal com…",
      },
      {
        id: 'AML-T0108',
        name: 'AI Agent',
        description:
          "Adversaries may abuse AI agents present on the victim's system for command and control. AI agents are often granted access to tools that can execute shell commands, reach out to the internet, and interact with other services in the victim's environment, making them capable C2 agents. The adversary may modify the behavi…",
      },
    ],
  },
  {
    id: 'AML-TA0010',
    name: 'Exfiltration',
    short_name: 'exfiltration',
    description:
      'The adversary is trying to steal AI artifacts or other information about the AI system. Exfiltration consists of techniques that adversaries may use to steal data from your network. Data may be stolen for its valuable intellectual property, or for use in staging future operations. Techniques for getting data out of a t…',
    techniques: [
      {
        id: 'AML-T0024',
        name: 'Exfiltration via AI Inference API',
        description:
          'Adversaries may exfiltrate private information via [AI Model Inference API Access](/techniques/AML.T0040). AI Models have been shown leak private information about their training data (e.g. [Infer Training Data Membership](/techniques/AML.T0024.000), [Invert AI Model](/techniques/AML.T0024.001)). The model itself may a…',
        subtechniques: [
          {
            id: 'AML-T0024.000',
            name: 'Infer Training Data Membership',
          },
          {
            id: 'AML-T0024.001',
            name: 'Invert AI Model',
          },
          {
            id: 'AML-T0024.002',
            name: 'Extract AI Model',
          },
        ],
      },
      {
        id: 'AML-T0025',
        name: 'Exfiltration via Cyber Means',
        description:
          'Adversaries may exfiltrate AI artifacts or other information relevant to their goals via traditional cyber means. See the ATT&CK [Exfiltration](https://attack.mitre.org/tactics/TA0010/) tactic for more information.',
      },
      {
        id: 'AML-T0056',
        name: 'Extract LLM System Prompt',
        description:
          "Adversaries may attempt to extract a large language model's (LLM) system prompt. This can be done via prompt injection to induce the model to reveal its own system prompt or may be extracted from a configuration file. System prompts can be a portion of an AI provider's competitive advantage and are thus valuable intell…",
      },
      {
        id: 'AML-T0057',
        name: 'LLM Data Leakage',
        description:
          'Adversaries may craft prompts that induce the LLM to leak sensitive information. This can include private user data or proprietary information. The leaked information may come from proprietary training data, data sources the LLM is connected to, or information from other users of the LLM.',
      },
      {
        id: 'AML-T0077',
        name: 'LLM Response Rendering',
        description:
          "An adversary may get a large language model (LLM) to respond with private information that is hidden from the user when the response is rendered by the user's client. The private information is then exfiltrated. This can take the form of rendered images, which automatically make a request to an adversary controlled ser…",
      },
      {
        id: 'AML-T0086',
        name: 'Exfiltration via AI Agent Tool Invocation',
        description:
          "AI agent tools capable of performing write operations may be invoked to exfiltrate data to an adversary. Sensitive information can be encoded into the tool's input parameters and transmitted to an adversary-controlled location (such as an inbox, document, or server) as part of a seemingly legitimate action. Variants in…",
      },
    ],
  },
  {
    id: 'AML-TA0011',
    name: 'Impact',
    short_name: 'impact',
    description:
      'The adversary is trying to manipulate, interrupt, erode confidence in, or destroy your AI systems and data. Impact consists of techniques that adversaries use to disrupt availability or compromise integrity by manipulating business and operational processes. Techniques used for impact can include destroying or tamperin…',
    techniques: [
      {
        id: 'AML-T0015',
        name: 'Evade AI Model',
        description:
          'Adversaries can [Craft Adversarial Data](/techniques/AML.T0043) that prevents an AI model from correctly identifying the contents of the data or [Generate Deepfakes](/techniques/AML.T0088) that fools an AI model expecting authentic data. This technique can be used to evade a downstream task where AI is utilized. The ad…',
      },
      {
        id: 'AML-T0029',
        name: 'Denial of AI Service',
        description:
          'Adversaries may target AI-enabled systems with a flood of requests for the purpose of degrading or shutting down the service. Since many AI systems require significant amounts of specialized compute, they are often expensive bottlenecks that can become overloaded. Adversaries can intentionally craft inputs that require…',
      },
      {
        id: 'AML-T0046',
        name: 'Spamming AI System with Chaff Data',
        description:
          'Adversaries may spam the AI system with chaff data that causes increase in the number of detections. This can cause analysts at the victim organization to waste time reviewing and correcting incorrect inferences. Adversaries may also spam AI agents with excessive low-severity auditable events or agentic actions that re…',
      },
      {
        id: 'AML-T0031',
        name: 'Erode AI Model Integrity',
        description:
          "Adversaries may degrade the target model's performance with adversarial data inputs to erode confidence in the system over time. This can lead to the victim organization wasting time and money both attempting to fix the system and performing the tasks it was meant to automate by hand.",
      },
      {
        id: 'AML-T0034',
        name: 'Cost Harvesting',
        description:
          "Adversaries may deliberately drive a victim's AI services beyond normal operating capacity with the intent of increasing the cost of services. This may be achieved via high-volume, low-complexity queries ([Excessive Queries](/techniques/AML.T0034.000)) or low-volume, high-complexity queries ([Resource-Intensive Queries…",
        subtechniques: [
          {
            id: 'AML-T0034.000',
            name: 'Excessive Queries',
          },
          {
            id: 'AML-T0034.001',
            name: 'Resource-Intensive Queries',
          },
          {
            id: 'AML-T0034.002',
            name: 'Agentic Resource Consumption',
          },
        ],
      },
      {
        id: 'AML-T0048',
        name: 'External Harms',
        description:
          'Adversaries may abuse their access to a victim system and use its resources or capabilities to further their goals by causing harms external to that system. These harms could affect the organization (e.g. Financial Harm, Reputational Harm), its users (e.g. User Harm), or the general public (e.g. Societal Harm).',
        subtechniques: [
          {
            id: 'AML-T0048.000',
            name: 'Financial Harm',
          },
          {
            id: 'AML-T0048.001',
            name: 'Reputational Harm',
          },
          {
            id: 'AML-T0048.002',
            name: 'Societal Harm',
          },
          {
            id: 'AML-T0048.003',
            name: 'User Harm',
          },
          {
            id: 'AML-T0048.004',
            name: 'AI Intellectual Property Theft',
          },
        ],
      },
      {
        id: 'AML-T0059',
        name: 'Erode Dataset Integrity',
        description:
          'Adversaries may poison or manipulate portions of a dataset to reduce its usefulness, reduce trust, and cause users to waste resources correcting errors.',
      },
      {
        id: 'AML-T0101',
        name: 'Data Destruction via AI Agent Tool Invocation',
        description:
          "Adversaries may invoke an AI agent's tool capable of performing mutative operations to perform Data Destruction. Adversaries may destroy data and files on specific systems or in large numbers on a network to interrupt availability to systems, services, and network resources.",
      },
      {
        id: 'AML-T0112',
        name: 'Machine Compromise',
        description:
          'Adversaries may compromise a machine by exploiting or manipulating AI-enabled components on the system. Compromising a victim system allows the adversary to execute arbitrary code, steal credentials, exfiltrate data, and continue to persist on the system. Adversaries may target a [Local AI Agent](/techniques/AML.T0112.…',
        subtechniques: [
          {
            id: 'AML-T0112.000',
            name: 'Local AI Agent',
          },
          {
            id: 'AML-T0112.001',
            name: 'AI Artifacts',
          },
        ],
      },
    ],
  },
];
